const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle, AttachmentBuilder } = require('discord.js');
const { Pool } = require('pg');

// Neon PostgreSQL Connection
const pool = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgresql://neondb_owner:npg_cL56QelHwXqf@ep-weathered-night-adfcxbnu-pooler.c-2.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require',
    ssl: {
        rejectUnauthorized: false
    }
});

// Global temp storage với auto cleanup
const tempStockData = new Map();

// Auto cleanup mỗi 5 phút
setInterval(() => {
    const now = Date.now();
    for (const [key, value] of tempStockData.entries()) {
        if (now - value.timestamp > 300000) { // 5 phút
            tempStockData.delete(key);
            console.log(`[🧹] Cleaned expired temp data: ${key}`);
        }
    }
}, 60000);

module.exports = {
    data: new SlashCommandBuilder()
        .setName('addstock')
        .setDescription('Add new stock to the database')
        .addAttachmentOption(option =>
            option.setName('file')
                .setDescription('TXT file containing accounts (format: email:pass)')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('service')
                .setDescription('Select service type (optional)')
                .addChoices(
                    { name: 'Xbox GamePass', value: 'xbox_gamepass' },
                    { name: 'Xbox Ultimate', value: 'xbox_ultimate' },
                    { name: 'Fan Member', value: 'fan_member' },
                    { name: 'Mega Fan', value: 'mega_fan' },
                    { name: 'Minecraft Non-Full', value: 'minecraft_nonfull' },
                    { name: 'Minecraft Full', value: 'minecraft_full' },
                    { name: 'Redeem Code Method', value: 'redeem_code' },
                    { name: 'Robux Method', value: 'robux' },
                    { name: 'LTC Method', value: 'ltc' },
                    { name: 'Nitro Method', value: 'nitro' }
                )),

    async execute(interaction) {
        try {
            // DEFER REPLY ngay lập tức - FIXED: Sử dụng ephemeral thay vì flags
            await interaction.deferReply({ ephemeral: false });
            
            if (!interaction.member.permissions.has('ADMINISTRATOR')) {
                return await interaction.editReply({
                    content: '❌ You need administrator permissions to use this command.'
                });
            }

            const file = interaction.options.getAttachment('file');
            const preSelectedService = interaction.options.getString('service');

            // Check if file is TXT
            if (!file.name.endsWith('.txt')) {
                return await interaction.editReply({
                    content: '❌ Please upload a TXT file.'
                });
            }

            const response = await fetch(file.url);
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            
            const fileContent = await response.text();
            
            // DEBUG: Hiển thị nội dung file để debug
            console.log('📄 File content preview:', fileContent.substring(0, 500));
            console.log('📊 Total file length:', fileContent.length);
            
            // Parse accounts với validation FLEXIBLE hơn
            const accounts = [];
            const invalidLines = [];
            const lines = fileContent.split('\n');
            
            for (let i = 0; i < lines.length; i++) {
                const line = lines[i].trim();
                if (!line) continue; // Bỏ qua dòng trống
                
                // Flexible parsing - cho phép nhiều định dạng
                if (line.includes(':')) {
                    const parts = line.split(':');
                    if (parts.length >= 2) {
                        const email = parts[0].trim();
                        const password = parts.slice(1).join(':').trim(); // Ghép lại phần còn lại
                        
                        // Email validation đơn giản hóa
                        if (email && password && email.length > 3 && password.length > 1) {
                            accounts.push({
                                email: email,
                                password: password,
                                valid: true
                            });
                            continue;
                        }
                    }
                }
                
                // Thử các định dạng khác
                if (line.includes('|')) {
                    const parts = line.split('|');
                    if (parts.length >= 2) {
                        const email = parts[0].trim();
                        const password = parts[1].trim();
                        
                        if (email && password && email.length > 3 && password.length > 1) {
                            accounts.push({
                                email: email,
                                password: password,
                                valid: true
                            });
                            continue;
                        }
                    }
                }
                
                // Thử định dạng email password (space separated)
                const spaceParts = line.split(/\s+/);
                if (spaceParts.length >= 2) {
                    const email = spaceParts[0].trim();
                    const password = spaceParts.slice(1).join(' ').trim();
                    
                    if (email && password && email.length > 3 && password.length > 1 && 
                        (email.includes('@') || email.includes('.') || /[a-zA-Z]/.test(email))) {
                        accounts.push({
                            email: email,
                            password: password,
                            valid: true
                        });
                        continue;
                    }
                }
                
                // Nếu không match bất kỳ định dạng nào
                if (line.length > 5) { // Chỉ xem là invalid nếu dòng có nội dung
                    invalidLines.push({
                        line: line,
                        lineNumber: i + 1
                    });
                }
            }

            console.log('✅ Valid accounts found:', accounts.length);
            console.log('❌ Invalid lines:', invalidLines.length);
            
            if (accounts.length === 0) {
                let errorMessage = '❌ No valid accounts found in the file.\n';
                errorMessage += `**File Analysis:**\n`;
                errorMessage += `• Total lines processed: ${lines.length}\n`;
                errorMessage += `• Valid accounts: 0\n`;
                errorMessage += `• Invalid/skipped lines: ${invalidLines.length}\n\n`;
                errorMessage += `**Expected Formats:**\n`;
                errorMessage += `• email:password\n`;
                errorMessage += `• email|password\n`;
                errorMessage += `• email password\n\n`;
                
                if (invalidLines.length > 0) {
                    errorMessage += `**First few problematic lines:**\n`;
                    invalidLines.slice(0, 5).forEach(invalid => {
                        errorMessage += `Line ${invalid.lineNumber}: "${invalid.line.substring(0, 50)}${invalid.line.length > 50 ? '...' : ''}"\n`;
                    });
                }
                
                return await interaction.editReply({
                    content: errorMessage
                });
            }

            // Nếu service đã được chọn trước, xử lý luôn
            if (preSelectedService) {
                return await processStockUpload(interaction, preSelectedService, accounts, file.name, fileContent);
            }

            // Store file content temporarily for service selection
            const tempData = {
                content: fileContent,
                accountCount: accounts.length,
                fileName: file.name,
                validAccounts: accounts.length,
                invalidAccounts: invalidLines.length,
                timestamp: Date.now()
            };

            // Create service selection menu với phân loại
            const serviceSelect = new ActionRowBuilder()
                .addComponents(
                    new StringSelectMenuBuilder()
                        .setCustomId(`serviceSelect_${interaction.id}`)
                        .setPlaceholder('Select the service type')
                        .addOptions([
                            {
                                label: '🎮 Xbox GamePass',
                                description: '5 invites = 1 Xbox GamePass Account',
                                value: 'xbox_gamepass',
                                emoji: '🎮'
                            },
                            {
                                label: '🎮 Xbox Ultimate',
                                description: '8 invites = 1 Xbox Ultimate Account',
                                value: 'xbox_ultimate',
                                emoji: '🎮'
                            },
                            {
                                label: '⭐ Fan Member',
                                description: '4 invites = Account Fan member',
                                value: 'fan_member',
                                emoji: '⭐'
                            },
                            {
                                label: '🌟 Mega Fan',
                                description: '9 invites = Account Mega Fan member',
                                value: 'mega_fan',
                                emoji: '🌟'
                            },
                            {
                                label: '⛏️ Minecraft Non-Full',
                                description: '2 invites = Minecraft Non-Full Access',
                                value: 'minecraft_nonfull',
                                emoji: '⛏️'
                            },
                            {
                                label: '⛏️ Minecraft Full',
                                description: '5 invites = Minecraft Full Access',
                                value: 'minecraft_full',
                                emoji: '⛏️'
                            },
                            {
                                label: '💎 Redeem Code Method',
                                description: '7 invites = Redeem Code Method',
                                value: 'redeem_code',
                                emoji: '💎'
                            },
                            {
                                label: '💰 Robux Method',
                                description: '7 invites = Robux Method',
                                value: 'robux',
                                emoji: '💰'
                            },
                            {
                                label: '₿ LTC Method',
                                description: '7 invites = Ltc Method',
                                value: 'ltc',
                                emoji: '₿'
                            },
                            {
                                label: '🎁 Nitro Method',
                                description: '7 invites = Nitro Method',
                                value: 'nitro',
                                emoji: '🎁'
                            }
                        ])
                );

            const embed = new EmbedBuilder()
                .setTitle('📦 Add Stock to Database')
                .setDescription(`**File:** ${file.name}\n**Valid Accounts:** ${accounts.length}\n**Invalid Lines:** ${invalidLines.length}\n**Size:** ${(file.size / 1024).toFixed(2)} KB\n\nPlease select the service type for this stock:`)
                .setColor(0x3498DB)
                .setFooter({ text: 'Stock Management System • Auto-cleanup in 5 minutes' })
                .setTimestamp();

            await interaction.editReply({
                embeds: [embed],
                components: [serviceSelect]
            });

            // Store temporary data
            tempStockData.set(interaction.id, tempData);

        } catch (error) {
            console.error('❌ Error in addstock command:', error);
            
            // Xử lý lỗi interaction không tồn tại
            if (error.code === 10062 || error.message.includes('Unknown interaction')) {
                console.log('⚠️ Interaction expired or not found, cannot reply');
                return;
            }
            
            try {
                await interaction.editReply({
                    content: `❌ Error: ${error.message}`
                });
            } catch (replyError) {
                console.error('❌ Could not send error message:', replyError);
            }
        }
    },
};

// Xử lý upload stock
async function processStockUpload(interaction, serviceType, accounts, fileName, fileContent) {
    const serviceNames = {
        'xbox_gamepass': 'Xbox GamePass Account',
        'xbox_ultimate': 'Xbox Ultimate Account',
        'fan_member': 'Fan Member Account',
        'mega_fan': 'Mega Fan Account',
        'minecraft_nonfull': 'Minecraft Account (Non-Full Access)',
        'minecraft_full': 'Minecraft Account (Full Access)',
        'redeem_code': 'Redeem Code Method',
        'robux': 'Robux Method',
        'ltc': 'LTC Method',
        'nitro': 'Nitro Method'
    };

    const serviceName = serviceNames[serviceType] || 'Unknown Service';

    try {
        let addedCount = 0;
        let errorCount = 0;
        const duplicateAccounts = [];
        const addedAccounts = [];

        // Hiển thị trạng thái đang xử lý
        await interaction.editReply({
            content: `⏳ Processing ${accounts.length} accounts for ${serviceName}...`,
            embeds: [],
            components: []
        });

        // Add each account to database với duplicate check
        for (let i = 0; i < accounts.length; i++) {
            const account = accounts[i];
            try {
                // Check for duplicate
                const duplicateCheck = await pool.query(
                    'SELECT id FROM stocks WHERE service_type = $1 AND account_data = $2 AND used = false',
                    [serviceType, `${account.email}:${account.password}`]
                );

                if (duplicateCheck.rows.length > 0) {
                    duplicateAccounts.push(`${account.email}:${account.password}`);
                    errorCount++;
                    continue;
                }

                await pool.query(
                    'INSERT INTO stocks (service_type, account_data) VALUES ($1, $2)',
                    [serviceType, `${account.email}:${account.password}`]
                );
                addedCount++;
                addedAccounts.push(`${account.email}:${account.password}`);
                
                // Update progress mỗi 10 accounts
                if (i % 10 === 0) {
                    await interaction.editReply({
                        content: `⏳ Processing... ${i + 1}/${accounts.length} accounts added...`,
                        embeds: [],
                        components: []
                    });
                }
            } catch (error) {
                console.error('Error adding account to database:', error);
                errorCount++;
            }
        }

        // Update stock channel với real-time tracking
        await updateStockSystem(interaction.client);

        // Tạo file log
        const logContent = generateLogContent(addedAccounts, duplicateAccounts, serviceName, fileName);
        const logAttachment = new AttachmentBuilder(
            Buffer.from(logContent, 'utf-8'),
            { name: `stock_log_${Date.now()}.txt` }
        );

        const resultEmbed = new EmbedBuilder()
            .setTitle('✅ Stock Added Successfully!')
            .setColor(0x2ECC71)
            .addFields(
                { name: '🛍️ Service', value: serviceName, inline: true },
                { name: '✅ Added', value: `${addedCount}`, inline: true },
                { name: '❌ Errors', value: `${errorCount}`, inline: true },
                { name: '📊 Duplicates', value: `${duplicateAccounts.length}`, inline: true },
                { name: '📁 File', value: fileName, inline: false }
            )
            .setFooter({ text: 'Stock Management System • Real-time Updates' })
            .setTimestamp();

        if (duplicateAccounts.length > 0) {
            resultEmbed.addFields({
                name: '⚠️ Duplicates Found',
                value: `Found ${duplicateAccounts.length} duplicate accounts that were skipped.`,
                inline: false
            });
        }

        await interaction.editReply({
            content: null,
            embeds: [resultEmbed],
            files: [logAttachment],
            components: []
        });

        // Gửi thông báo đến stock channel
        await sendStockNotification(interaction.client, serviceName, addedCount, fileName);

    } catch (error) {
        console.error('Error adding stock to database:', error);
        await interaction.editReply({
            content: `❌ Error adding stock to database: ${error.message}`,
            components: []
        });
    }
}

// Handle service selection - FIXED VERSION
async function handleServiceSelection(interaction, client) {
    try {
        // DEFER UPDATE ngay lập tức
        await interaction.deferUpdate();
        
        const serviceType = interaction.values[0];
        const interactionId = interaction.customId.replace('serviceSelect_', '');
        
        const tempData = tempStockData.get(interactionId);
        if (!tempData) {
            return await interaction.editReply({
                content: '❌ Session expired. Please upload the file again.',
                components: []
            });
        }

        // Parse accounts lại từ content với flexible parsing
        const accounts = [];
        const lines = tempData.content.split('\n');
        
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line) continue;
            
            if (line.includes(':')) {
                const parts = line.split(':');
                if (parts.length >= 2) {
                    const email = parts[0].trim();
                    const password = parts.slice(1).join(':').trim();
                    
                    if (email && password && email.length > 3 && password.length > 1) {
                        accounts.push({
                            email: email,
                            password: password,
                            valid: true
                        });
                    }
                }
            }
        }

        await processStockUpload(interaction, serviceType, accounts, tempData.fileName, tempData.content);
        
        // Clean up temporary data
        tempStockData.delete(interactionId);

    } catch (error) {
        console.error('Error in service selection:', error);
        
        // Xử lý lỗi interaction không tồn tại
        if (error.code === 10062 || error.message.includes('Unknown interaction')) {
            console.log('⚠️ Interaction expired during service selection');
            return;
        }
        
        await interaction.editReply({
            content: '❌ There was an error processing your selection. Please try again.',
            components: []
        });
    }
}

// Update toàn bộ hệ thống stock
async function updateStockSystem(client) {
    try {
        const stockChannel = await client.channels.fetch('1423687884187111538');
        await updateStockEmbed(stockChannel);
        await updateStockStats(client);
    } catch (error) {
        console.log('[⚠️] Could not update stock system:', error.message);
    }
}

// Update stock embed với design đẹp hơn
async function updateStockEmbed(channel) {
    try {
        // Get all stock counts với thống kê chi tiết
        const stockResult = await pool.query(`
            SELECT 
                service_type, 
                COUNT(*) as total_count,
                COUNT(CASE WHEN used = false THEN 1 END) as available_count,
                COUNT(CASE WHEN used = true THEN 1 END) as used_count
            FROM stocks 
            GROUP BY service_type
            ORDER BY available_count DESC
        `);

        const serviceNames = {
            'xbox_gamepass': '🎮 Xbox GamePass',
            'xbox_ultimate': '🎮 Xbox Ultimate', 
            'fan_member': '⭐ Fan Member',
            'mega_fan': '🌟 Mega Fan',
            'minecraft_nonfull': '⛏️ Minecraft Non-Full',
            'minecraft_full': '⛏️ Minecraft Full',
            'redeem_code': '💎 Redeem Code',
            'robux': '💰 Robux',
            'ltc': '₿ LTC',
            'nitro': '🎁 Nitro'
        };

        const totalAvailable = stockResult.rows.reduce((sum, row) => sum + parseInt(row.available_count), 0);
        const totalUsed = stockResult.rows.reduce((sum, row) => sum + parseInt(row.used_count), 0);

        const stockEmbed = new EmbedBuilder()
            .setTitle('📊 REAL-TIME STOCK DASHBOARD')
            .setColor(0x9B59B6)
            .setDescription(`**Last Updated:** <t:${Math.floor(Date.now()/1000)}:R>\n**Total Available:** ${totalAvailable} accounts\n**Total Used:** ${totalUsed} accounts`)
            .setFooter({ text: 'Stock Management System • Auto-updating' })
            .setTimestamp();

        // Chia thành 2 columns cho đẹp
        const availableStock = [];
        const usedStock = [];

        for (const [type, name] of Object.entries(serviceNames)) {
            const stock = stockResult.rows.find(row => row.service_type === type);
            const available = stock ? parseInt(stock.available_count) : 0;
            const used = stock ? parseInt(stock.used_count) : 0;
            const total = stock ? parseInt(stock.total_count) : 0;

            if (available > 0) {
                availableStock.push(`**${name}**\n🟢 ${available} available\n⚪ ${total} total`);
            } else {
                usedStock.push(`**${name}**\n🔴 Out of stock\n⚪ ${total} total`);
            }
        }

        if (availableStock.length > 0) {
            stockEmbed.addFields({
                name: '🟢 AVAILABLE STOCK',
                value: availableStock.join('\n'),
                inline: true
            });
        }

        if (usedStock.length > 0) {
            stockEmbed.addFields({
                name: '🔴 OUT OF STOCK',
                value: usedStock.join('\n'),
                inline: true
            });
        }

        // Get existing stock message hoặc tạo mới
        const messages = await channel.messages.fetch({ limit: 50 });
        let stockMessage = messages.find(msg => 
            msg.embeds.length > 0 && 
            msg.embeds[0].title && 
            msg.embeds[0].title.includes('REAL-TIME STOCK DASHBOARD')
        );

        if (stockMessage) {
            await stockMessage.edit({ embeds: [stockEmbed] });
        } else {
            stockMessage = await channel.send({ embeds: [stockEmbed] });
            // Pin message để dễ theo dõi
            try {
                await stockMessage.pin();
            } catch (error) {
                console.log('[⚠️] Could not pin stock message');
            }
        }

    } catch (error) {
        console.error('Error updating stock embed:', error);
    }
}

// Update stock statistics
async function updateStockStats(client) {
    try {
        const statsChannel = await client.channels.fetch('1423687884187111538');
        
        const statsResult = await pool.query(`
            SELECT 
                COUNT(*) as total_accounts,
                COUNT(CASE WHEN used = false THEN 1 END) as available_accounts,
                COUNT(CASE WHEN used = true THEN 1 END) as used_accounts,
                COUNT(DISTINCT service_type) as service_types,
                MIN(created_at) as oldest_stock,
                MAX(created_at) as newest_stock
            FROM stocks
        `);

        const stats = statsResult.rows[0];
        
        const statsEmbed = new EmbedBuilder()
            .setTitle('📈 STOCK STATISTICS')
            .setColor(0xE67E22)
            .addFields(
                { name: '📦 Total Accounts', value: `${stats.total_accounts}`, inline: true },
                { name: '🟢 Available', value: `${stats.available_accounts}`, inline: true },
                { name: '🔴 Used', value: `${stats.used_accounts}`, inline: true },
                { name: '🛍️ Service Types', value: `${stats.service_types}`, inline: true },
                { name: '📅 Oldest Stock', value: stats.oldest_stock ? `<t:${Math.floor(new Date(stats.oldest_stock).getTime()/1000)}:R>` : 'N/A', inline: true },
                { name: '🆕 Newest Stock', value: stats.newest_stock ? `<t:${Math.floor(new Date(stats.newest_stock).getTime()/1000)}:R>` : 'N/A', inline: true }
            )
            .setFooter({ text: 'Stock Analytics • Auto-updating' })
            .setTimestamp();

        // Tìm hoặc tạo stats message
        const messages = await statsChannel.messages.fetch({ limit: 50 });
        let statsMessage = messages.find(msg => 
            msg.embeds.length > 0 && 
            msg.embeds[0].title && 
            msg.embeds[0].title.includes('STOCK STATISTICS')
        );

        if (statsMessage) {
            await statsMessage.edit({ embeds: [statsEmbed] });
        } else {
            await statsChannel.send({ embeds: [statsEmbed] });
        }

    } catch (error) {
        console.error('Error updating stock stats:', error);
    }
}

// Gửi thông báo stock mới
async function sendStockNotification(client, serviceName, count, fileName) {
    try {
        const notificationChannel = await client.channels.fetch('1423687884187111538');
        
        const notificationEmbed = new EmbedBuilder()
            .setTitle('🆕 NEW STOCK ADDED')
            .setColor(0x2ECC71)
            .setDescription(`**${count}** new accounts added to **${serviceName}**`)
            .addFields(
                { name: '📁 Source File', value: fileName, inline: true },
                { name: '⏰ Added At', value: `<t:${Math.floor(Date.now()/1000)}:R>`, inline: true },
                { name: '🛍️ Service', value: serviceName, inline: true }
            )
            .setFooter({ text: 'Stock Notification System' })
            .setTimestamp();

        await notificationChannel.send({ embeds: [notificationEmbed] });
    } catch (error) {
        console.error('Error sending stock notification:', error);
    }
}

// Tạo log content
function generateLogContent(addedAccounts, duplicateAccounts, serviceName, fileName) {
    let logContent = `STOCK UPLOAD LOG\n`;
    logContent += `================\n`;
    logContent += `Service: ${serviceName}\n`;
    logContent += `File: ${fileName}\n`;
    logContent += `Timestamp: ${new Date().toISOString()}\n`;
    logContent += `Added Accounts: ${addedAccounts.length}\n`;
    logContent += `Duplicate Accounts: ${duplicateAccounts.length}\n\n`;
    
    logContent += `ADDED ACCOUNTS:\n`;
    logContent += `===============\n`;
    addedAccounts.forEach(account => {
        logContent += `${account}\n`;
    });
    
    if (duplicateAccounts.length > 0) {
        logContent += `\nDUPLICATE ACCOUNTS (SKIPPED):\n`;
        logContent += `===========================\n`;
        duplicateAccounts.forEach(account => {
            logContent += `${account}\n`;
        });
    }
    
    return logContent;
}

// Handle interactions - FIXED VERSION với error handling tốt hơn
module.exports.handleInteractions = (client) => {
    console.log('[🔧] Setting up addstock interactions...');
    
    client.on('interactionCreate', async (interaction) => {
        if (!interaction.isStringSelectMenu()) return;

        if (interaction.customId.startsWith('serviceSelect_')) {
            try {
                await handleServiceSelection(interaction, client);
            } catch (error) {
                console.error('[❌] Addstock interaction error:', error);
                
                // Xử lý lỗi interaction không tồn tại
                if (error.code === 10062 || error.message.includes('Unknown interaction')) {
                    console.log('⚠️ Interaction expired, cannot process selection');
                    return;
                }
                
                try {
                    if (interaction.deferred || interaction.replied) {
                        await interaction.editReply({
                            content: '❌ There was an error processing your selection. Please try again.',
                            components: []
                        });
                    } else {
                        await interaction.reply({
                            content: '❌ There was an error processing your selection. Please try again.',
                            ephemeral: true
                        });
                    }
                } catch (replyError) {
                    console.error('[❌] Error sending error message:', replyError);
                }
            }
        }
    });
};

// Auto-cleanup for temp data
setInterval(() => {
    const now = Date.now();
    let cleanedCount = 0;
    
    for (const [key, value] of tempStockData.entries()) {
        if (now - value.timestamp > 300000) { // 5 phút
            tempStockData.delete(key);
            cleanedCount++;
        }
    }
    
    if (cleanedCount > 0) {
        console.log(`[🧹] Auto-cleaned ${cleanedCount} expired temp data entries`);
    }
}, 300000); // 5 phút