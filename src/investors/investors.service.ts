
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
}
