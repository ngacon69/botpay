const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

function runBots() {
    console.log('🔍 Đang tìm kiếm các file bot.js...');
    
    // Đọc thư mục gốc
    const rootDir = __dirname;
    const items = fs.readdirSync(rootDir, { withFileTypes: true });
    
    let botCount = 0;
    
    items.forEach(item => {
        if (item.isDirectory()) {
            const botPath = path.join(rootDir, item.name, 'bot.js');
            
            if (fs.existsSync(botPath)) {
                console.log(`🟢 Đang chạy bot trong: ${item.name}`);
                botCount++;
                
                // Chạy bot.js
                const botProcess = spawn('node', [botPath], {
                    stdio: 'inherit',
                    cwd: path.dirname(botPath)
                });
                
                // Xử lý lỗi
                botProcess.on('error', (error) => {
                    console.error(`❌ Lỗi khi chạy bot trong ${item.name}:`, error.message);
                });
            }
        }
    });
    
    if (botCount === 0) {
        console.log('❌ Không tìm thấy file bot.js nào trong các thư mục con');
    } else {
        console.log(`✅ Đã khởi chạy ${botCount} bot`);
    }
}

runBots();