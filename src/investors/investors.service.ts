
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class InvestorsService {
    constructor(private prisma: PrismaService) { }

    async findAll() {
        return this.prisma.investor.findMany({
            include: {
                stocks: {
                    include: {
                        stock: true, // Include stock details like price
                    },
                },
            },
        });
    }

    async findOne(id: string) {
        return this.prisma.investor.findUnique({
            where: { id },
            include: {
                stocks: {
                    include: {
                        stock: true,
                    },
                },
            },
        });
    }

    async fixDuplicates() {
        const investors = await this.prisma.investor.findMany({
            include: { stocks: true }
        });

        const grouped = new Map<string, typeof investors>();
        for (const inv of investors) {
            const key = inv.name.trim().toLowerCase();
            if (!grouped.has(key)) grouped.set(key, []);
            grouped.get(key)?.push(inv);
        }

        const results = [];

        for (const [name, records] of grouped.entries()) {
            if (records.length > 1) {
                // Determine the "keeper" (one with most stocks or latest update)
                records.sort((a, b) => b.stocks.length - a.stocks.length || b.lastUpdated.getTime() - a.lastUpdated.getTime());
                const keeper = records[0];
                const toDelete = records.slice(1);

                for (const dup of toDelete) {
                    // Move stocks
                    for (const stock of dup.stocks) {
                        const existing = keeper.stocks.find(s => s.stockSymbol === stock.stockSymbol);
                        if (!existing) {
                            await this.prisma.investorStock.update({
                                where: { id: stock.id },
                                data: { investorId: keeper.id }
                            });
                        } else {
                            // Delete duplicate link
                            await this.prisma.investorStock.delete({ where: { id: stock.id } });
                        }
                    }
                    // Delete the investor
                    await this.prisma.investor.delete({ where: { id: dup.id } });
                }
                results.push(`Fixed ${name}: Merged ${records.length} records into ID ${keeper.id}`);
            }
        }
        return { message: 'Deduplication complete', fixed: results };
    }
}
