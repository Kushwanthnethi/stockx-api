
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { StrategistService } from '../strategist/strategist.service';

async function testStrategist() {
    console.log("🚀 Initializing NestJS App Context...");
    const app = await NestFactory.createApplicationContext(AppModule);
    const strategist = app.get(StrategistService);

    const query = "Analyze ZOMATO for a long term investment";
    console.log(`\n🕵️‍♂️ Running Strategist Analysis for: "${query}"...\n`);

    try {
        // We can call analyze directly which orchestrates everything
        const result: any = await strategist.analyze(query);

        if (result.error) {
            console.error("❌ Error:", result.error);
        } else {
            console.log("----------------------------------------------------------------");
            console.log(`✅ Symbol Identified: ${result.symbol}`);
            console.log(`📊 Price: ${result.quote?.regularMarketPrice}`);
            console.log(`📉 RSI: ${result.technicals?.rsi?.toFixed(2)}`);
            console.log(`📈 ROC: ${result.technicals?.roc?.toFixed(2)}`);
            console.log(`🏦 ROE: ${result.fundamentals?.roe}`);
            console.log(`📰 Upgrades:`, result.fundamentals?.upgrades);
            console.log("----------------------------------------------------------------");
            console.log("\n📜 GENERATED STRATEGY (Markdown Preview):\n");
            console.log(result.strategy);
            console.log("\n----------------------------------------------------------------");
        }
    } catch (error) {
        console.error("❌ Execution Failed:", error);
    }

    await app.close();
}

testStrategist();
