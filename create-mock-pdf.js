const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');
const fs = require('fs');

async function createStockPDF() {
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage();
    const { width, height } = page.getSize();
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);

    const text = `
    RELIANCE INDUSTRIES LIMITED
    Integrated Annual Report 2023-24
    
    ... (Marketing pages) ...
    
    FINANCIAL STATEMENTS
    
    Consolidated Balance Sheet
    as at March 31, 2024
    
    (₹ in Crore)
    ---------------------------------------------------------
    Particulars                     |  Note  |  2024      |  2023
    ---------------------------------------------------------
    ASSETS
    1. Non-current assets
       (a) Property, Plant and Equip|  1     |  500,000   |  480,000
       (b) Capital work-in-progress |  2     |  150,000   |  120,000
    
    2. Current assets
       (a) Inventories              |  8     |   90,000   |   85,000
       (b) Financial Assets
           (i) Trade Receivables    |  9     |   25,000   |   22,000
           (ii) Cash & Cash Equiv   | 10     |   30,000   |   40,000
           
    TOTAL ASSETS                    |        | 1,200,500  | 1,100,000
    ---------------------------------------------------------
    
    EQUITY AND LIABILITIES
    1. Equity
       (a) Equity Share Capital     | 12     |    6,000   |    6,000
       (b) Other Equity             | 13     |  800,000   |  700,000
       
    Total Equity                             |  806,000   |  706,000
    ---------------------------------------------------------
  `;

    page.drawText(text, {
        x: 50,
        y: height - 50,
        size: 10,
        font: font,
        color: rgb(0, 0, 0),
        lineHeight: 14,
    });

    const pdfBytes = await pdfDoc.save();
    fs.writeFileSync('reliance-mock.pdf', pdfBytes);
    console.log('Created reliance-mock.pdf');
}

createStockPDF();
