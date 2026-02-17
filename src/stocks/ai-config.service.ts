import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  GoogleGenerativeAI,
  GenerativeModel,
  GenerationConfig,
} from '@google/generative-ai';

@Injectable()
export class AIConfigService {
  private readonly logger = new Logger(AIConfigService.name);
  private keys: string[] = [];
  private clients: GoogleGenerativeAI[] = [];
  private currentKeyIndex = 0;
  private keyCooldowns: Map<number, number> = new Map(); // index -> reset timestamp

  private sowClient: GoogleGenerativeAI | null = null;
  private sowKeyCooldown: number = 0;

  private strategistKeys: string[] = [];
  private strategistClients: GoogleGenerativeAI[] = [];
  private strategistKeyIndex = 0;
  private strategistCooldowns: Map<number, number> = new Map();

  private poolSafetyCooldowns: Map<string, number> = new Map(); // poolName -> resetAt

  constructor(private configService: ConfigService) { }

  onModuleInit() {
    this.initializeKeys();
  }

  private initializeKeys() {
    // Shared Keys
    const rawKey = this.configService.get<string>('GEMINI_API_KEY') || '';
    this.keys = rawKey.split(',').map((k) => k.replace(/["']/g, '').trim()).filter((k) => k.length > 0);
    if (this.keys.length > 0) this.clients = this.keys.map((key) => new GoogleGenerativeAI(key));

    const sowKey = (this.configService.get<string>('SOW_GEMINI_API_KEY') || '').replace(/["']/g, '').trim();
    if (sowKey) this.sowClient = new GoogleGenerativeAI(sowKey);

    const stratKey = (this.configService.get<string>('STRATEGIST_GEMINI_API_KEY') || '').replace(/["']/g, '').trim();
    this.strategistKeys = stratKey.split(',').map((k) => k.replace(/["']/g, '').trim()).filter((k) => k.length > 0);
    if (this.strategistKeys.length > 0) {
      this.strategistClients = this.strategistKeys.map((key) => new GoogleGenerativeAI(key));
      this.logger.log(`Strategist AI Pool Initialized with ${this.strategistKeys.length} keys.`);
    }
    this.logger.log(`AI Config Initialized with ${this.keys.length} shared keys.`);
  }

  private getAvailableKeyIndex(pool: 'shared' | 'strategist' = 'shared'): number | null {
    const now = Date.now();
    const safety = this.poolSafetyCooldowns.get(pool) || 0;
    if (now < safety) return null; // Whole pool is taking a breather

    const keys = pool === 'shared' ? this.keys : this.strategistKeys;
    const cooldowns = pool === 'shared' ? this.keyCooldowns : this.strategistCooldowns;
    const currentIndex = pool === 'shared' ? this.currentKeyIndex : this.strategistKeyIndex;

    if (keys.length === 0) return null;

    for (let i = 0; i < keys.length; i++) {
      const index = (currentIndex + i) % keys.length;
      const cooldown = cooldowns.get(index);

      if (!cooldown || now >= cooldown) {
        if (cooldown) {
          this.logger.log(`${pool.toUpperCase()} Key ${index} recovered from cooldown.`);
          cooldowns.delete(index);
        }
        return index;
      }
    }
    return null;
  }

  getModelWithPool(config: {
    model: string;
    generationConfig?: GenerationConfig;
    isSOW?: boolean;
    isStrategist?: boolean;
  }): { model: GenerativeModel; pool: 'shared' | 'sow' | 'strategist' | 'none' } {
    const now = Date.now();

    // 1. Dedicated SOW
    if (config.isSOW && this.sowClient) {
      if (now >= this.sowKeyCooldown) {
        return { model: this.sowClient.getGenerativeModel(config), pool: 'sow' };
      }
      this.logger.warn(`SOW key in cooldown, falling back to shared keys.`);
    }

    // 2. Dedicated Strategist Pool
    if (config.isStrategist && this.strategistClients.length > 0) {
      const index = this.getAvailableKeyIndex('strategist');
      if (index !== null) {
        this.strategistKeyIndex = index;
        return { model: this.strategistClients[index].getGenerativeModel(config), pool: 'strategist' };
      }
      this.logger.warn(`CRITICAL: Strategist pool exhausted (All 4 keys hit limit). Falling back to shared keys...`);
      return this.getAvailableKeyIndex('shared') !== null
        ? this.getModelWithPool({ ...config, isStrategist: false })
        : { model: null as any, pool: 'none' };
    }

    // 3. Shared Pool
    if (this.clients.length === 0) {
      this.logger.warn('No shared AI clients available.');
      return { model: null as any, pool: 'none' };
    }

    const index = this.getAvailableKeyIndex('shared');
    if (index !== null) {
      this.currentKeyIndex = index;
      return { model: this.clients[index].getGenerativeModel(config), pool: 'shared' };
    }

    return { model: null as any, pool: 'none' };
  }

  // Legacy wrapper
  getModel(config: any): GenerativeModel | null {
    const res = this.getModelWithPool(config);
    return res.model;
  }

  private globalCooldown: number = 0; // timestamp

  handleServiceOverload(delaySeconds: number = 60, mode: 'shared' | 'sow' | 'strategist' = 'shared') {
    const resetAt = Date.now() + delaySeconds * 1000;
    if (mode === 'sow') {
      this.sowKeyCooldown = resetAt;
      this.logger.error(`SOW OVERLOAD: Pause until ${new Date(resetAt).toLocaleTimeString()}.`);
    } else if (mode === 'strategist') {
      this.globalCooldown = resetAt; // For now use global for strategist too or could be separate
      this.logger.error(`STRATEGIST OVERLOAD: Pause until ${new Date(resetAt).toLocaleTimeString()}.`);
    } else {
      this.globalCooldown = resetAt;
      this.logger.error(`GLOBAL OVERLOAD: Pause until ${new Date(resetAt).toLocaleTimeString()}.`);
    }
  }

  get isOverloaded(): boolean {
    return Date.now() < this.globalCooldown;
  }

  handleQuotaExceeded(delaySeconds: number = 60, mode: 'shared' | 'sow' | 'strategist' = 'shared') {
    const resetAt = Date.now() + delaySeconds * 1000;

    // Safety breather: Shared pool gets a short pause to prevent flood.
    // Strategist (Paid) should allow instant failover.
    if (mode === 'shared') {
      this.poolSafetyCooldowns.set(mode, Date.now() + 2000);
    }

    if (mode === 'sow') {
      this.sowKeyCooldown = resetAt;
      this.logger.error(`SOW Quota Exceeded. Key reset until ${new Date(resetAt).toLocaleTimeString()}.`);
    } else if (mode === 'strategist' && this.strategistKeys.length > 0) {
      this.strategistCooldowns.set(this.strategistKeyIndex, resetAt);
      this.logger.error(`Strategist Key ${this.strategistKeyIndex} Restricted until ${new Date(resetAt).toLocaleTimeString()}.`);
      this.strategistKeyIndex = (this.strategistKeyIndex + 1) % this.strategistKeys.length;
    } else {
      this.keyCooldowns.set(this.currentKeyIndex, resetAt);
      this.logger.error(`Shared Key ${this.currentKeyIndex} Restricted until ${new Date(resetAt).toLocaleTimeString()}.`);
      this.currentKeyIndex = (this.currentKeyIndex + 1) % this.keys.length;
    }
  }

  get isAllExhausted(): boolean {
    const sharedAvailable = this.getAvailableKeyIndex('shared') !== null;
    const sowAvailable = this.sowClient && Date.now() >= this.sowKeyCooldown;
    const strategistAvailable = this.strategistClients.length > 0 && this.getAvailableKeyIndex('strategist') !== null;
    return !sharedAvailable && !sowAvailable && !strategistAvailable;
  }

  get activeKeyCount(): number {
    const now = Date.now();
    let count = 0;
    for (let i = 0; i < this.keys.length; i++) {
      const cooldown = this.keyCooldowns.get(i);
      if (!cooldown || now >= cooldown) count++;
    }
    return count;
  }
  async delay(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  get totalKeysCount(): number {
    return this.keys.length;
  }

  get nextResetTimestamp(): number | null {
    if (this.keyCooldowns.size === 0) return null;
    // Return the earliest time when *any* key will be ready
    return Math.min(...Array.from(this.keyCooldowns.values()));
  }
}
