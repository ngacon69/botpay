const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

class BotManager {
    constructor() {
        this.botProcesses = new Map();
        this.isShuttingDown = false;
    }

    async runBots() {
        console.log('🔍 Đang tìm kiếm các file bot.js...');
        
        const rootDir = __dirname;
        const items = fs.readdirSync(rootDir, { withFileTypes: true });
        
        let botCount = 0;
        
        // Xử lý tắt ứng dụng đẹp hơn
        this.setupGracefulShutdown();
        
        for (const item of items) {
            if (item.isDirectory()) {
                const botPath = path.join(rootDir, item.name, 'bot.js');
                
                if (fs.existsSync(botPath)) {
                    await this.startBot(item.name, botPath);
                    botCount++;
                    
                    // Thêm delay nhỏ để tránh khởi chạy đồng thời quá nhiều process
                    await new Promise(resolve => setTimeout(resolve, 100));
                }
            }
        }
        
        if (botCount === 0) {
            console.log('❌ Không tìm thấy file bot.js nào trong các thư mục con');
        } else {
            console.log(`✅ Đã khởi chạy ${botCount} bot`);
            console.log('📝 Sử dụng Ctrl+C để dừng tất cả bot');
        }
    }

    async startBot(botName, botPath) {
        console.log(`🟢 Đang chạy bot trong: ${botName}`);
        
        try {
            const botProcess = spawn('node', [botPath], {
                stdio: 'inherit',
                cwd: path.dirname(botPath),
                env: { ...process.env, BOT_NAME: botName }
            });
            
            this.botProcesses.set(botName, botProcess);
            
            botProcess.on('error', (error) => {
                console.error(`❌ Lỗi khi chạy bot ${botName}:`, error.message);
                this.botProcesses.delete(botName);
            });
            
            botProcess.on('exit', (code, signal) => {
                console.log(`🔴 Bot ${botName} đã dừng (code: ${code}, signal: ${signal})`);
                this.botProcesses.delete(botName);
                
                // Tự động khởi động lại bot nếu không phải do shutdown
                if (!this.isShuttingDown && code !== 0) {
                    console.log(`🔄 Đang khởi động lại bot ${botName}...`);
                    setTimeout(() => this.startBot(botName, botPath), 5000);
                }
            });
            
        } catch (error) {
            console.error(`❌ Không thể khởi chạy bot ${botName}:`, error.message);
        }
    }

    setupGracefulShutdown() {
        const shutdownSignals = ['SIGINT', 'SIGTERM', 'SIGQUIT'];
        
        shutdownSignals.forEach(signal => {
            process.on(signal, async () => {
                if (this.isShuttingDown) return;
                
                this.isShuttingDown = true;
                console.log(`\n🛑 Nhận tín hiệu ${signal}, đang dừng tất cả bot...`);
                
                await this.stopAllBots();
                process.exit(0);
            });
        });
    }

    async stopAllBots() {
        const stopPromises = [];
        
        for (const [botName, process] of this.botProcesses) {
            console.log(`⏳ Đang dừng bot: ${botName}`);
            stopPromises.push(this.stopBot(botName, process));
        }
        
        await Promise.allSettled(stopPromises);
        console.log('✅ Tất cả bot đã được dừng');
    }

    stopBot(botName, botProcess) {
        return new Promise((resolve) => {
            if (botProcess.killed || botProcess.exitCode !== null) {
                resolve();
                return;
            }
            
            const timeout = setTimeout(() => {
                console.log(`⚠️  Bot ${botName} không phản hồi,强制关闭...`);
                botProcess.kill('SIGKILL');
                resolve();
            }, 5000);
            
            botProcess.on('exit', () => {
                clearTimeout(timeout);
                resolve();
            });
            
            botProcess.kill('SIGTERM');
        });
    }

    // Phương thức để khởi chạy lại một bot cụ thể
    async restartBot(botName) {
        const botPath = path.join(__dirname, botName, 'bot.js');
        if (fs.existsSync(botPath)) {
            const existingProcess = this.botProcesses.get(botName);
            if (existingProcess) {
                await this.stopBot(botName, existingProcess);
            }
            await this.startBot(botName, botPath);
        }
    }

    // Lấy trạng thái của tất cả bot
    getBotStatus() {
        const status = {};
        for (const [botName, process] of this.botProcesses) {
            status[botName] = {
                pid: process.pid,
                running: !process.killed && process.exitCode === null
            };
        }
        return status;
    }
}

// Sử dụng
const botManager = new BotManager();
botManager.runBots().catch(console.error);

// Export để có thể sử dụng từ module khác (nếu cần)
module.exports = BotManager;
