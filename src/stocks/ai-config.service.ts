import { Injectable, Logger } from '@nestjs/common';
import { GoogleGenerativeAI, GenerativeModel, GenerationConfig } from '@google/generative-ai';

@Injectable()
export class AIConfigService {
    private readonly logger = new Logger(AIConfigService.name);
    private keys: string[] = [];
    private clients: GoogleGenerativeAI[] = [];
    private currentKeyIndex = 0;
    private keyCooldowns: Map<number, number> = new Map(); // index -> reset timestamp

    constructor() {
        this.initializeKeys();
    }

    private initializeKeys() {
        const rawKey = process.env.GEMINI_API_KEY || "";
        this.keys = rawKey.split(',').map(k => k.replace(/["']/g, "").trim()).filter(k => k.length > 0);

        if (this.keys.length === 0) {
            this.logger.warn('No GEMINI_API_KEY found in environment.');
            return;
        }

        this.clients = this.keys.map(key => new GoogleGenerativeAI(key));
        this.logger.log(`AI Config Initialized with ${this.keys.length} API keys.`);
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

    getModel(config: { model: string; generationConfig?: GenerationConfig }): GenerativeModel | null {
        if (this.clients.length === 0) return null;

        const index = this.getAvailableKeyIndex();
        if (index !== null) {
            this.currentKeyIndex = index;
            return this.clients[index].getGenerativeModel(config);
        }

        return null;
    }

    private globalCooldown: number = 0; // timestamp

    handleServiceOverload(delaySeconds: number = 60) {
        this.globalCooldown = Date.now() + (delaySeconds * 1000);
        this.logger.error(`GLOBAL AI OVERLOAD: Service unavailable. Pausing all calls until ${new Date(this.globalCooldown).toLocaleTimeString()}.`);
    }

    get isOverloaded(): boolean {
        return Date.now() < this.globalCooldown;
    }

    handleQuotaExceeded(delaySeconds: number = 60) {
        const now = Date.now();
        // Key is dead for at least delaySeconds (default to 1 min for RPM)
        const resetAt = now + (delaySeconds * 1000);
        this.keyCooldowns.set(this.currentKeyIndex, resetAt);

        this.logger.error(`API Key ${this.currentKeyIndex} (${this.keys[this.currentKeyIndex].substring(0, 8)}...) restricted until ${new Date(resetAt).toLocaleTimeString()}.`);

        // Move to next internal index to try someone else next time
        this.currentKeyIndex = (this.currentKeyIndex + 1) % this.keys.length;
    }

    get isAllExhausted(): boolean {
        if (this.keys.length === 0) return true;
        return this.getAvailableKeyIndex() === null;
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
        return new Promise(resolve => setTimeout(resolve, ms));
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
