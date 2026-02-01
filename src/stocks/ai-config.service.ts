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

  constructor(private configService: ConfigService) { }

  onModuleInit() {
    this.initializeKeys();
  }

  private initializeKeys() {
    const rawKey = this.configService.get<string>('GEMINI_API_KEY') || '';
    this.keys = rawKey
      .split(',')
      .map((k) => k.replace(/["']/g, '').trim())
      .filter((k) => k.length > 0);

    if (this.keys.length === 0) {
      this.logger.warn('No GEMINI_API_KEY found in environment.');
      return;
    }

    this.clients = this.keys.map((key) => new GoogleGenerativeAI(key));
    this.logger.log(`AI Config Initialized with ${this.keys.length} API keys.`);

    const sowKey = (this.configService.get<string>('SOW_GEMINI_API_KEY') || '').replace(/["']/g, '').trim();
    if (sowKey) {
      this.sowClient = new GoogleGenerativeAI(sowKey);
      this.logger.log('Dedicated Stock of the Week API key initialized.');
    }
  }

  private getAvailableKeyIndex(): number | null {
    const now = Date.now();
    // Try starting from currentKeyIndex
    for (let i = 0; i < this.keys.length; i++) {
      const index = (this.currentKeyIndex + i) % this.keys.length;
      const cooldown = this.keyCooldowns.get(index);

      if (!cooldown || now >= cooldown) {
        if (cooldown) {
          this.logger.log(`Key ${index} has recovered from cooldown.`);
          this.keyCooldowns.delete(index);
        }
        return index;
      }
    }
    return null;
  }

  getModel(config: {
    model: string;
    generationConfig?: GenerationConfig;
    isSOW?: boolean;
  }): GenerativeModel | null {
    if (config.isSOW && this.sowClient) {
      const now = Date.now();
      if (now >= this.sowKeyCooldown) {
        return this.sowClient.getGenerativeModel(config);
      }
      this.logger.warn(`Dedicated SOW key is in cooldown until ${new Date(this.sowKeyCooldown).toLocaleTimeString()}, falling back to shared keys.`);
    }

    if (this.clients.length === 0) {
      this.logger.warn('No shared AI clients available.');
      return null;
    }

    const index = this.getAvailableKeyIndex();
    if (index !== null) {
      this.currentKeyIndex = index;
      return this.clients[index].getGenerativeModel(config);
    }

    return null;
  }

  private globalCooldown: number = 0; // timestamp

  handleServiceOverload(delaySeconds: number = 60, isSOW: boolean = false) {
    const now = Date.now();
    const resetAt = now + delaySeconds * 1000;
    if (isSOW) {
      this.sowKeyCooldown = resetAt;
      this.logger.error(
        `DEDICATED SOW OVERLOAD: Pausing SOW key until ${new Date(resetAt).toLocaleTimeString()}.`,
      );
    } else {
      this.globalCooldown = resetAt;
      this.logger.error(
        `GLOBAL AI OVERLOAD: Service unavailable. Pausing all calls until ${new Date(this.globalCooldown).toLocaleTimeString()}.`,
      );
    }
  }

  get isOverloaded(): boolean {
    return Date.now() < this.globalCooldown;
  }

  handleQuotaExceeded(delaySeconds: number = 60, isSOW: boolean = false) {
    const now = Date.now();
    // Key is dead for at least delaySeconds (default to 1 min for RPM)
    const resetAt = now + delaySeconds * 1000;

    if (isSOW) {
      this.sowKeyCooldown = resetAt;
      this.logger.error(
        `Dedicated SOW API Key restricted until ${new Date(resetAt).toLocaleTimeString()}. Fallback to shared keys enabled.`,
      );
    } else {
      this.keyCooldowns.set(this.currentKeyIndex, resetAt);

      this.logger.error(
        `API Key ${this.currentKeyIndex} (${this.keys[this.currentKeyIndex].substring(0, 8)}...) restricted until ${new Date(resetAt).toLocaleTimeString()}.`,
      );

      // Move to next internal index to try someone else next time
      this.currentKeyIndex = (this.currentKeyIndex + 1) % this.keys.length;
    }
  }

  get isAllExhausted(): boolean {
    if (this.keys.length === 0 && !this.sowClient) return true;
    const sharedAvailable = this.getAvailableKeyIndex() !== null;
    const sowAvailable = this.sowClient && Date.now() >= this.sowKeyCooldown;
    return !sharedAvailable && !sowAvailable;
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
