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
        .setDescription('Add new stock to custom services database')
        .addAttachmentOption(option =>
            option.setName('file')
                .setDescription('TXT file containing accounts (format: email:pass)')
                .setRequired(true)),

    async execute(interaction) {
        try {
            // DEFER REPLY ngay lập tức
            await interaction.deferReply({ ephemeral: false });
            
            if (!interaction.member.permissions.has('ADMINISTRATOR')) {
                return await interaction.editReply({
                    content: '❌ You need administrator permissions to use this command.'
                });
            }

            const file = interaction.options.getAttachment('file');

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

            // Lấy danh sách custom services từ database
            const servicesResult = await pool.query(
                'SELECT * FROM custom_services WHERE is_active = true ORDER BY service_name'
            );

            if (servicesResult.rows.length === 0) {
                return await interaction.editReply({
                    content: '❌ No custom services found! Please create services first using `/createservice` command.'
                });
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

            // Tạo service selection menu từ custom services
            const serviceOptions = servicesResult.rows.map(service => {
                const categoryIcons = {
                    'gaming': '🎮',
                    'accounts': '💳',
                    'crypto': '💰',
                    'giftcards': '🎁',
                    'boosts': '⚡',
                    'tools': '🔧',
                    'social': '📱',
                    'entertainment': '🎵',
                    'shopping': '🛒',
                    'security': '🔐'
                };

                const icon = categoryIcons[service.service_category] || '🛠️';

                return {
                    label: service.service_name.length > 25 ? service.service_name.substring(0, 22) + '...' : service.service_name,
                    description: `Price: ${service.service_price}`,
                    value: service.id.toString(),
                    emoji: icon
                };
            });

            const serviceSelect = new ActionRowBuilder()
                .addComponents(
                    new StringSelectMenuBuilder()
                        .setCustomId(`customServiceSelect_${interaction.id}`)
                        .setPlaceholder('Select the custom service')
                        .addOptions(serviceOptions)
                );

            const embed = new EmbedBuilder()
                .setTitle('📦 Add Stock to Custom Services')
                .setDescription(`**File:** ${file.name}\n**Valid Accounts:** ${accounts.length}\n**Invalid Lines:** ${invalidLines.length}\n**Size:** ${(file.size / 1024).toFixed(2)} KB\n\nPlease select the custom service for this stock:`)
                .setColor(0x3498DB)
                .setFooter({ text: 'Custom Stock Management • Auto-cleanup in 5 minutes' })
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

// Xử lý upload stock cho custom services
async function processCustomStockUpload(interaction, serviceId, accounts, fileName, fileContent) {
    try {
        // Lấy thông tin service từ database
        const serviceResult = await pool.query(
            'SELECT * FROM custom_services WHERE id = $1',
            [serviceId]
        );

        if (serviceResult.rows.length === 0) {
            return await interaction.editReply({
                content: '❌ Service not found! The service might have been deleted.'
            });
        }

        const service = serviceResult.rows[0];
        const serviceName = service.service_name;
        const serviceCategory = service.service_category;

        let addedCount = 0;
        let errorCount = 0;
        const duplicateAccounts = [];
        const addedAccounts = [];

        // Hiển thị trạng thái đang xử lý
        await interaction.editReply({
            content: `⏳ Processing ${accounts.length} accounts for **${serviceName}**...`,
            embeds: [],
            components: []
        });

        // Tạo bảng custom_stocks nếu chưa tồn tại
        await pool.query(`
            CREATE TABLE IF NOT EXISTS custom_stocks (
                id SERIAL PRIMARY KEY,
                service_id INTEGER REFERENCES custom_services(id),
                account_data TEXT NOT NULL,
                used BOOLEAN DEFAULT FALSE,
                created_at TIMESTAMP DEFAULT NOW()
            );
        `);

        // Add each account to custom_stocks database với duplicate check
        for (let i = 0; i < accounts.length; i++) {
            const account = accounts[i];
            try {
                // Check for duplicate
                const duplicateCheck = await pool.query(
                    'SELECT id FROM custom_stocks WHERE service_id = $1 AND account_data = $2 AND used = false',
                    [serviceId, `${account.email}:${account.password}`]
                );

                if (duplicateCheck.rows.length > 0) {
                    duplicateAccounts.push(`${account.email}:${account.password}`);
                    errorCount++;
                    continue;
                }

                await pool.query(
                    'INSERT INTO custom_stocks (service_id, account_data) VALUES ($1, $2)',
                    [serviceId, `${account.email}:${account.password}`]
                );
                addedCount++;
                addedAccounts.push(`${account.email}:${account.password}`);
                
                // Update progress mỗi 10 accounts
                if (i % 10 === 0) {
                    await interaction.editReply({
                        content: `⏳ Processing... ${i + 1}/${accounts.length} accounts added to **${serviceName}**...`,
                        embeds: [],
                        components: []
                    });
                }
            } catch (error) {
                console.error('Error adding account to custom_stocks:', error);
                errorCount++;
            }
        }

        // Update custom stock system
        await updateCustomStockSystem(interaction.client);

        // Tạo file log
        const logContent = generateCustomLogContent(addedAccounts, duplicateAccounts, service, fileName);
        const logAttachment = new AttachmentBuilder(
            Buffer.from(logContent, 'utf-8'),
            { name: `custom_stock_log_${Date.now()}.txt` }
        );

        const categoryIcons = {
            'gaming': '🎮',
            'accounts': '💳',
            'crypto': '💰',
            'giftcards': '🎁',
            'boosts': '⚡',
            'tools': '🔧',
            'social': '📱',
            'entertainment': '🎵',
            'shopping': '🛒',
            'security': '🔐'
        };

        const icon = categoryIcons[serviceCategory] || '🛠️';

        const resultEmbed = new EmbedBuilder()
            .setTitle('✅ Custom Stock Added Successfully!')
            .setColor(0x2ECC71)
            .addFields(
                { name: `${icon} Service`, value: `**${serviceName}**`, inline: true },
                { name: '💰 Price', value: service.service_price, inline: true },
                { name: '📊 Category', value: service.service_category, inline: true },
                { name: '✅ Added', value: `${addedCount}`, inline: true },
                { name: '❌ Errors', value: `${errorCount}`, inline: true },
                { name: '📁 File', value: fileName, inline: true }
            )
            .setFooter({ text: 'Custom Stock Management • Independent System' })
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

        // Gửi thông báo đến custom stock channel
        await sendCustomStockNotification(interaction.client, service, addedCount, fileName);

    } catch (error) {
        console.error('Error adding custom stock to database:', error);
        await interaction.editReply({
            content: `❌ Error adding stock to custom service: ${error.message}`,
            components: []
        });
    }
}

// Handle custom service selection
async function handleCustomServiceSelection(interaction, client) {
    try {
        // DEFER UPDATE ngay lập tức
        await interaction.deferUpdate();
        
        const serviceId = interaction.values[0];
        const interactionId = interaction.customId.replace('customServiceSelect_', '');
        
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

        await processCustomStockUpload(interaction, serviceId, accounts, tempData.fileName, tempData.content);
        
        // Clean up temporary data
        tempStockData.delete(interactionId);

    } catch (error) {
        console.error('Error in custom service selection:', error);
        
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

// Update custom stock system
async function updateCustomStockSystem(client) {
    try {
        // Có thể thêm channel ID cho custom stock nếu cần
        // const customStockChannel = await client.channels.fetch('YOUR_CUSTOM_STOCK_CHANNEL_ID');
        // await updateCustomStockEmbed(customStockChannel);
        console.log('[✅] Custom stock system updated');
    } catch (error) {
        console.log('[⚠️] Could not update custom stock system:', error.message);
    }
}

// Gửi thông báo custom stock
async function sendCustomStockNotification(client, service, count, fileName) {
    try {
        // Có thể gửi đến channel cụ thể hoặc dùng channel hiện tại
        const notificationChannel = await client.channels.fetch('1423687884187111538');
        
        const categoryIcons = {
            'gaming': '🎮',
            'accounts': '💳',
            'crypto': '💰',
            'giftcards': '🎁',
            'boosts': '⚡',
            'tools': '🔧',
            'social': '📱',
            'entertainment': '🎵',
            'shopping': '🛒',
            'security': '🔐'
        };

        const icon = categoryIcons[service.service_category] || '🛠️';

        const notificationEmbed = new EmbedBuilder()
            .setTitle('🆕 NEW CUSTOM STOCK ADDED')
            .setColor(0x9B59B6)
            .setDescription(`**${count}** new accounts added to custom service`)
            .addFields(
                { name: `${icon} Service`, value: `**${service.service_name}**`, inline: true },
                { name: '💰 Price', value: service.service_price, inline: true },
                { name: '📊 Category', value: service.service_category, inline: true },
                { name: '📁 Source File', value: fileName, inline: true },
                { name: '⏰ Added At', value: `<t:${Math.floor(Date.now()/1000)}:R>`, inline: true }
            )
            .setFooter({ text: 'Custom Stock Notification System' })
            .setTimestamp();

        await notificationChannel.send({ embeds: [notificationEmbed] });
    } catch (error) {
        console.error('Error sending custom stock notification:', error);
    }
}

// Tạo custom log content
function generateCustomLogContent(addedAccounts, duplicateAccounts, service, fileName) {
    let logContent = `CUSTOM STOCK UPLOAD LOG\n`;
    logContent += `=======================\n`;
    logContent += `Service: ${service.service_name}\n`;
    logContent += `Price: ${service.service_price}\n`;
    logContent += `Category: ${service.service_category}\n`;
    logContent += `Description: ${service.service_description}\n`;
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

// Handle interactions cho custom services
module.exports.handleInteractions = (client) => {
    console.log('[🔧] Setting up custom addstock interactions...');
    
    client.on('interactionCreate', async (interaction) => {
        if (!interaction.isStringSelectMenu()) return;

        if (interaction.customId.startsWith('customServiceSelect_')) {
            try {
                await handleCustomServiceSelection(interaction, client);
            } catch (error) {
                console.error('[❌] Custom addstock interaction error:', error);
                
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