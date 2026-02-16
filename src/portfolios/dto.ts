export class SyncPortfolioDto {
    name?: string;
    encryptedData: string;
    totalValue?: number;
    dayChange?: number;
    analysis?: {
        healthScore: number;
        riskLevel: string;
        insights: any;
    };
}
