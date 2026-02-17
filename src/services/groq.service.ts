
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Groq from 'groq-sdk';

@Injectable()
export class GroqService {
    private readonly logger = new Logger(GroqService.name);
    private groq: Groq;
    private readonly modalName = 'llama-3.3-70b-versatile'; // Or 'llama3-70b-8192' depending on availability

    constructor(private configService: ConfigService) {
        const apiKey = this.configService.get<string>('GROQ_API_KEY');
        if (!apiKey) {
            this.logger.error('GROQ_API_KEY is not defined in environment variables');
        }
        this.groq = new Groq({ apiKey });
    }

    async generateCompletion(prompt: string): Promise<string> {
        try {
            const chatCompletion = await this.getGroqChatCompletion(prompt);
            return chatCompletion.choices[0]?.message?.content || "";
        } catch (error: any) {
            this.logger.error('Groq API Error', error);
            if (error?.status === 429) {
                throw new Error("GROQ_RATE_LIMIT");
            }
            throw error;
        }
    }

    private async getGroqChatCompletion(content: string) {
        return this.groq.chat.completions.create({
            messages: [
                {
                    role: "user",
                    content: content,
                },
            ],
            model: this.modalName,
            temperature: 0.5,
            max_tokens: 1024,
            top_p: 1,
            stop: null,
            stream: false,
        });
    }
}
