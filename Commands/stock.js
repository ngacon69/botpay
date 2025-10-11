const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { Pool } = require('pg');

// Neon PostgreSQL Connection
const pool = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgresql://neondb_owner:npg_cL56QelHwXqf@ep-weathered-night-adfcxbnu-pooler.c-2.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require',
    ssl: {
        rejectUnauthorized: false
    }
});

module.exports = {
    data: new SlashCommandBuilder()
        .setName('stock')
        .setDescription('Check available stock with detailed information')
        .addStringOption(option =>
            option.setName('service')
                .setDescription('Select specific service to check')
                .setRequired(false)
                .addChoices(
                    { name: 'Xbox GamePass', value: 'xbox_gamepass' },
                    { name: 'Xbox Ultimate', value: 'xbox_ultimate' },
                    { name: 'Fan Member', value: 'fan_member' },
                    { name: 'Mega Fan', value: 'mega_fan' },
                    { name: 'Minecraft Non-Full', value: 'minecraft_nonfull' },
                    { name: 'Minecraft Full', value: 'minecraft_full' },
                    { name: 'Redeem Code', value: 'redeem_code' },
                    { name: 'Robux', value: 'robux' },
                    { name: 'LTC', value: 'ltc' },
                    { name: 'Nitro', value: 'nitro' }
                )),

    async execute(interaction) {
        try {
            await interaction.deferReply({ ephemeral: false });

            const specificService = interaction.options.getString('service');

            // Service names mapping với giá trị
            const serviceInfo = {
                'xbox_gamepass': { name: '🎮 Xbox GamePass', value: 5 },
                'xbox_ultimate': { name: '🎮 Xbox Ultimate', value: 8 },
                'fan_member': { name: '⭐ Fan Member', value: 4 },
                'mega_fan': { name: '🌟 Mega Fan', value: 9 },
                'minecraft_nonfull': { name: '⛏️ Minecraft Non-Full', value: 2 },
                'minecraft_full': { name: '⛏️ Minecraft Full', value: 5 },
                'redeem_code': { name: '💎 Redeem Code', value: 7 },
                'robux': { name: '💰 Robux', value: 7 },
                'ltc': { name: '₿ LTC', value: 7 },
                'nitro': { name: '🎁 Nitro', value: 7 }
            };

            if (specificService) {
                // Detailed view for specific service
                const stockResult = await pool.query(
                    `SELECT 
                        COUNT(*) as total_count,
                        COUNT(CASE WHEN used = false THEN 1 END) as available_count,
                        COUNT(CASE WHEN used = true THEN 1 END) as used_count,
                        MIN(created_at) as oldest_stock,
                        MAX(created_at) as newest_stock
                    FROM stocks 
                    WHERE service_type = $1`,
                    [specificService]
                );

                const stock = stockResult.rows[0];
                const service = serviceInfo[specificService];
                
                if (!stock || stock.total_count === 0) {
                    return await interaction.editReply({
                        content: `❌ No stock found for **${service.name}**`
                    });
                }

                const embed = new EmbedBuilder()
                    .setTitle(`📊 ${service.name} STOCK`)
                    .setColor(0x3498DB)
                    .setDescription(`**Invites Required:** ${service.value} invites`)
                    .addFields(
                        { name: '🟢 Available', value: `**${stock.available_count}** accounts`, inline: true },
                        { name: '🔴 Used', value: `${stock.used_count} accounts`, inline: true },
                        { name: '📦 Total', value: `${stock.total_count} accounts`, inline: true },
                        { name: '📅 Oldest Stock', value: stock.oldest_stock ? `<t:${Math.floor(new Date(stock.oldest_stock).getTime()/1000)}:R>` : 'N/A', inline: true },
                        { name: '🆕 Newest Stock', value: stock.newest_stock ? `<t:${Math.floor(new Date(stock.newest_stock).getTime()/1000)}:R>` : 'N/A', inline: true },
                        { name: '📊 Usage Rate', value: `${((stock.used_count / stock.total_count) * 100).toFixed(1)}%`, inline: true }
                    )
                    .setFooter({ text: 'Stock Management System' })
                    .setTimestamp();

                await interaction.editReply({ embeds: [embed] });

            } else {
                // Overview of all services
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

                const totalAvailable = stockResult.rows.reduce((sum, row) => sum + parseInt(row.available_count), 0);
                const totalUsed = stockResult.rows.reduce((sum, row) => sum + parseInt(row.used_count), 0);
                const totalAccounts = stockResult.rows.reduce((sum, row) => sum + parseInt(row.total_count), 0);

                // Phân loại stock status
                const availableServices = stockResult.rows.filter(row => row.available_count > 0);
                const outOfStockServices = stockResult.rows.filter(row => row.available_count === 0);

                const embed = new EmbedBuilder()
                    .setTitle('📊 STOCK OVERVIEW')
                    .setColor(0x9B59B6)
                    .setDescription(`**Last Updated:** <t:${Math.floor(Date.now()/1000)}:R>`)
                    .addFields(
                        { 
                            name: '📈 SUMMARY', 
                            value: `**🟢 Available:** ${totalAvailable} accounts\n**🔴 Used:** ${totalUsed} accounts\n**📦 Total:** ${totalAccounts} accounts\n**🛍️ Services:** ${stockResult.rows.length} types`,
                            inline: false 
                        }
                    )
                    .setFooter({ text: `Showing ${availableServices.length} available services • Use /stock <service> for details` })
                    .setTimestamp();

                // Hiển thị các service có stock trước
                if (availableServices.length > 0) {
                    let availableText = '';
                    availableServices.forEach(row => {
                        const service = serviceInfo[row.service_type];
                        availableText += `**${service.name}** - ${row.available_count} available (${service.value} invites)\n`;
                    });
                    embed.addFields({ name: '🟢 AVAILABLE STOCK', value: availableText, inline: false });
                }

                // Hiển thị các service hết stock
                if (outOfStockServices.length > 0) {
                    let outOfStockText = '';
                    outOfStockServices.forEach(row => {
                        const service = serviceInfo[row.service_type];
                        outOfStockText += `**${service.name}** - ${row.used_count}/${row.total_count} used\n`;
                    });
                    embed.addFields({ name: '🔴 OUT OF STOCK', value: outOfStockText, inline: false });
                }

                await interaction.editReply({ embeds: [embed] });
            }

        } catch (error) {
            console.error('Error checking stock:', error);
            await interaction.editReply({
                content: '❌ Error checking stock. Please try again later.'
            });
        }
    },
};