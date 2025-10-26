const { EmbedBuilder } = require('discord.js');

const ALLOWED_CHANNEL_ID = '1431900224028151916';
const SERVICES = ['minecraft', 'xboxgp', 'xboxul', 'unban'];

module.exports = {
    data: {
        name: 'stock',
        description: 'Check available accounts stock'
    },
    
    async execute(message, args, client) {
        // Check if command is used in allowed channel
        if (message.channel.id !== ALLOWED_CHANNEL_ID) {
            return await message.reply({
                content: `❌ This command can only be used in <#${ALLOWED_CHANNEL_ID}>`,
                ephemeral: true
            });
        }

        try {
            // Get stock counts for all services
            const stockCounts = {};
            let totalAccounts = 0;
            
            for (const service of SERVICES) {
                const result = await client.pool.query(
                    'SELECT COUNT(*) FROM stocks WHERE service = $1',
                    [service]
                );
                stockCounts[service] = parseInt(result.rows[0].count);
                totalAccounts += stockCounts[service];
            }

            // Calculate free and premium counts
            const freeCount = stockCounts.minecraft + stockCounts.xboxgp;
            const premiumCount = stockCounts.minecraft + stockCounts.xboxul + stockCounts.unban;

            // Create embed
            const embed = new EmbedBuilder()
                .setTitle('📦 ACCOUNT STOCK INFORMATION')
                .setColor(0x00ff00)
                .setTimestamp()
                .setFooter({ text: `Requested by ${message.author.tag}`, iconURL: message.author.displayAvatarURL() })
                .addFields(
                    {
                        name: '🎁 FREE SERVICES',
                        value: `• **Minecraft**: ${stockCounts.minecraft} accounts\n• **Xbox Game Pass**: ${stockCounts.xboxgp} accounts\n• **Total Free**: ${freeCount} accounts`,
                        inline: false
                    },
                    {
                        name: '💎 PREMIUM SERVICES',
                        value: `• **Minecraft**: ${stockCounts.minecraft} accounts\n• **Xbox Ultimate**: ${stockCounts.xboxul} accounts\n• **Unban**: ${stockCounts.unban} accounts\n• **Total Premium**: ${premiumCount} accounts`,
                        inline: false
                    },
                    {
                        name: '📊 OVERALL STATS',
                        value: `**Total Accounts**: ${totalAccounts}\n**Available Services**: ${SERVICES.length}`,
                        inline: false
                    }
                )
                .setDescription('**Note:** Minecraft accounts are available in both Free and Premium tiers');

            await message.reply({ embeds: [embed] });

        } catch (error) {
            console.error('Error checking stock:', error);
            await message.reply({
                content: '❌ An error occurred while checking stock!',
                ephemeral: true
            });
        }
    }
};