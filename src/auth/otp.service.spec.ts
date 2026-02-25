import { Test, TestingModule } from '@nestjs/testing';
import { OtpService } from './otp.service';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../services/mail.service';

const mockPrismaService = {
    otp: {
        deleteMany: jest.fn(),
        create: jest.fn(),
        findFirst: jest.fn(),
        delete: jest.fn(),
    },
};

describe('OtpService', () => {
    let service: OtpService;
    let prisma: PrismaService;
    let moduleRef: TestingModule;

    beforeEach(async () => {
        moduleRef = await Test.createTestingModule({
            providers: [
                OtpService,
                {
                    provide: PrismaService,
                    useValue: mockPrismaService,
                },
                {
                    provide: MailService,
                    useValue: {
                        sendEmail: jest.fn().mockResolvedValue(true),
                    },
                },
            ],
        }).compile();

        service = moduleRef.get<OtpService>(OtpService);
        prisma = moduleRef.get<PrismaService>(PrismaService);

        // Clear all mocks before each test
        jest.clearAllMocks();
    });

    it('should be defined', () => {
        expect(service).toBeDefined();
    });

    describe('generateAndSendOtp', () => {
        it('should generate an OTP and save it to the database', async () => {
            const email = 'test@example.com';
            await service.generateAndSendOtp(email);

            expect(prisma.otp.deleteMany).toHaveBeenCalledWith({ where: { email } });
            expect(prisma.otp.create).toHaveBeenCalledWith({
                data: expect.objectContaining({
                    email,
                    code: expect.any(String),
                    expiresAt: expect.any(Date),
                }),
            });
        });

        it('should throw an error if email fails to send', async () => {
            const email = 'test@example.com';

            // Mock the mail service to fail
            const mailService = moduleRef.get<MailService>(MailService);
            jest.spyOn(mailService, 'sendEmail').mockResolvedValueOnce(false);

            await expect(service.generateAndSendOtp(email)).rejects.toThrow('Failed to send verification email');
        });
    });

    describe('verifyOtp', () => {
        it('should return true for a valid OTP and delete it', async () => {
            const email = 'test@example.com';
            const code = '123456';

            // Mock finding a valid OTP
            mockPrismaService.otp.findFirst.mockResolvedValueOnce({ id: 'some-id', email, code, expiresAt: new Date(Date.now() + 100000) });

            const isValid = await service.verifyOtp(email, code);

            expect(prisma.otp.findFirst).toHaveBeenCalledWith({
                where: { email, code, expiresAt: { gt: expect.any(Date) } },
                orderBy: { createdAt: 'desc' },
            });
            expect(prisma.otp.delete).toHaveBeenCalledWith({ where: { id: 'some-id' } });
            expect(isValid).toBe(true);
        });

        it('should return false if OTP is invalid or expired', async () => {
            const email = 'test@example.com';
            const code = '123456';

            // Mock not finding any OTP record (expired or invalid)
            mockPrismaService.otp.findFirst.mockResolvedValueOnce(null);

            const isValid = await service.verifyOtp(email, code);

            expect(prisma.otp.findFirst).toHaveBeenCalledWith({
                where: { email, code, expiresAt: { gt: expect.any(Date) } },
                orderBy: { createdAt: 'desc' },
            });
            expect(prisma.otp.delete).not.toHaveBeenCalled();
            expect(isValid).toBe(false);
        });
    });
});
