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

export class AddHoldingDto {
    symbol: string;
    quantity: number;
    averageBuyPrice: number;
}

export class UpdateHoldingDto {
    quantity?: number;
    averageBuyPrice?: number;
}
