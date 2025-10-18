const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, StringSelectMenuBuilder } = require('discord.js');
const { Pool } = require('pg');

// Database connection
const pool = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgresql://neondb_owner:npg_cL56QelHwXqf@ep-weathered-night-adfcxbnu-pooler.c-2.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require',
    ssl: {
        rejectUnauthorized: false
    }
});

module.exports = {
    data: new SlashCommandBuilder()
        .setName('treat')
        .setDescription('🎁 Steal an account from custom services and drop it secretly!')
        .addChannelOption(option =>
            option.setName('channel')
                .setDescription('Channel to send the stolen account')
                .setRequired(true)
                .addChannelTypes(ChannelType.GuildText)),

    async execute(interaction) {
        if (!interaction.member.permissions.has('ADMINISTRATOR')) {
            return await interaction.reply({
                content: '❌ You need administrator permissions to use this command.',
                flags: 64
            });
        }

        const channel = interaction.options.getChannel('channel');

        try {
            // Lấy danh sách custom services có stock từ database
            const servicesResult = await pool.query(`
                SELECT cs.*, COUNT(cs2.id) as stock_count 
                FROM custom_services cs 
                LEFT JOIN custom_stocks cs2 ON cs.id = cs2.service_id AND cs2.used = false 
                WHERE cs.is_active = true 
                GROUP BY cs.id 
                HAVING COUNT(cs2.id) > 0 
                ORDER BY cs.service_name
            `);

            if (servicesResult.rows.length === 0) {
                return await interaction.reply({
                    content: '❌ No custom services with available stock found! Please create services and add stock first.',
                    flags: 64
                });
            }

            // Tạo service selection menu
            const serviceOptions = servicesResult.rows.map(service => ({
                label: service.service_name.length > 25 ? service.service_name.substring(0, 22) + '...' : service.service_name,
                description: `Stock: ${service.stock_count} accounts`,
                value: service.id.toString(),
                emoji: '🎁'
            }));

            const serviceSelect = new ActionRowBuilder()
                .addComponents(
                    new StringSelectMenuBuilder()
                        .setCustomId(`treatServiceSelect_${interaction.id}`)
                        .setPlaceholder('Select service to steal from...')
                        .addOptions(serviceOptions)
                );

            const embed = new EmbedBuilder()
                .setTitle('🎁 Secret Treat - Choose Service')
                .setDescription(`**Target Channel:** ${channel}\n\nSelect which service you want to steal an account from:`)
                .setColor(0xFFD700)
                .setFooter({ 
                    text: 'Secret Treat System • Choose wisely!', 
                    iconURL: interaction.user.displayAvatarURL() 
                })
                .setTimestamp();

            await interaction.reply({
                embeds: [embed],
                components: [serviceSelect],
                flags: 64
            });

            // Store channel data temporarily
            const tempData = {
                channelId: channel.id,
                channelName: channel.name,
                userId: interaction.user.id,
                timestamp: Date.now()
            };

            // Store in interaction client if available, or use a simple Map
            if (!interaction.client.treatTempData) {
                interaction.client.treatTempData = new Map();
            }
            interaction.client.treatTempData.set(interaction.id, tempData);

        } catch (error) {
            console.error('Treat command error:', error);
            await interaction.reply({
                content: '❌ There was an error loading services!',
                flags: 64
            });
        }
    },
};

// Handle service selection for treat
async function handleTreatServiceSelection(interaction, client) {
    try {
        await interaction.deferUpdate();
        
        const serviceId = interaction.values[0];
        const interactionId = interaction.customId.replace('treatServiceSelect_', '');
        
        // Get stored channel data
        const tempData = client.treatTempData?.get(interactionId);
        if (!tempData) {
            return await interaction.editReply({
                content: '❌ Session expired. Please start over.',
                components: []
            });
        }

        const channelId = tempData.channelId;
        const channel = await client.channels.fetch(channelId);

        // Get service info
        const serviceResult = await pool.query(
            'SELECT * FROM custom_services WHERE id = $1',
            [serviceId]
        );

        if (serviceResult.rows.length === 0) {
            return await interaction.editReply({
                content: '❌ Service not found!',
                components: []
            });
        }

        const service = serviceResult.rows[0];

        // Get a random available account from custom_stocks
        const stockResult = await pool.query(
            `SELECT * FROM custom_stocks 
             WHERE service_id = $1 AND used = false 
             ORDER BY RANDOM() LIMIT 1`,
            [serviceId]
        );

        if (stockResult.rows.length === 0) {
            return await interaction.editReply({
                content: `❌ No available stock found for ${service.service_name}!`,
                components: []
            });
        }

        const stock = stockResult.rows[0];
        const [email, password] = stock.account_data.split(':');

        // Delete the stock from database (mark as used)
        await pool.query('DELETE FROM custom_stocks WHERE id = $1', [stock.id]);

        // Create the stolen account embed
        const stolenEmbed = new EmbedBuilder()
            .setTitle('🎁 SECRET TREAT DROP! 🎁')
            .setDescription('**I secretly stole this account for you guys! 🤫**\n\n*This is our little secret - use it wisely!*')
            .setColor(0xFFD700) // Vàng gold
            .addFields(
                {
                    name: '📧 Email',
                    value: `\`\`\`${email}\`\`\``,
                    inline: false
                },
                {
                    name: '🔑 Password',
                    value: `\`\`\`${password}\`\`\``,
                    inline: false
                },
                {
                    name: '🎯 Service',
                    value: `**${service.service_name}**`,
                    inline: true
                },
                {
                    name: '📝 Description',
                    value: service.service_description ? `*${service.service_description.substring(0, 100)}${service.service_description.length > 100 ? '...' : ''}*` : '*No description*',
                    inline: false
                },
                {
                    name: '⏰ Dropped',
                    value: `<t:${Math.floor(Date.now()/1000)}:R>`,
                    inline: true
                }
            )
            .setFooter({ 
                text: 'Top Secret Treat • Keep it quiet! 🤫', 
                iconURL: interaction.user.displayAvatarURL() 
            })
            .setTimestamp()
            .setThumbnail('https://cdn.discordapp.com/emojis/1417164913985454162.gif?size=96&quality=lossless');

        // Add delete button for cleanup
        const deleteButton = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId(`delete_treat_${Date.now()}`)
                    .setLabel('🗑️ Delete Treat')
                    .setStyle(ButtonStyle.Danger)
            );

        // Send to the specified channel
        const treatMessage = await channel.send({
            content: '🎉 **SECRET TREAT APPEARED!** 🎉',
            embeds: [stolenEmbed],
            components: [deleteButton]
        });

        // Success confirmation
        const successEmbed = new EmbedBuilder()
            .setTitle('✅ Secret Treat Delivered!')
            .setDescription(`Successfully stole and delivered account to ${channel}!`)
            .setColor(0x00FF00)
            .addFields(
                { name: '📦 Account', value: `||${email}||`, inline: true },
                { name: '🎯 Service', value: service.service_name, inline: true },
                { name: '📍 Channel', value: channel.toString(), inline: true },
                { name: '🔢 Remaining Stock', value: `Check \`/services\` for current stock`, inline: false }
            )
            .setFooter({ text: 'Treat System • Stealth mode activated' })
            .setTimestamp();

        await interaction.editReply({
            content: null,
            embeds: [successEmbed],
            components: []
        });

        // Clean up temp data
        client.treatTempData?.delete(interactionId);

        // Handle delete button
        const filter = (btnInteraction) => btnInteraction.customId === `delete_treat_${treatMessage.id}`;
        const collector = treatMessage.createMessageComponentCollector({ filter, time: 300000 }); // 5 minutes

        collector.on('collect', async (btnInteraction) => {
            if (btnInteraction.member.permissions.has('ADMINISTRATOR') || btnInteraction.user.id === interaction.user.id) {
                await treatMessage.delete();
                await btnInteraction.reply({
                    content: '✅ Secret treat message deleted!',
                    flags: 64
                });
            } else {
                await btnInteraction.reply({
                    content: '❌ You need administrator permissions to delete this treat!',
                    flags: 64
                });
            }
        });

    } catch (error) {
        console.error('Error in treat service selection:', error);
        
        if (interaction.deferred || interaction.replied) {
            await interaction.editReply({
                content: '❌ There was an error processing your selection. Please try again.',
                components: []
            });
        } else {
            await interaction.reply({
                content: '❌ There was an error processing your selection. Please try again.',
                flags: 64
            });
        }
    }
}

// Handle interactions for treat
module.exports.handleInteractions = (client) => {
    console.log('[🎁] Setting up treat interactions...');

    client.on('interactionCreate', async (interaction) => {
        if (!interaction.isStringSelectMenu()) return;

        if (interaction.customId.startsWith('treatServiceSelect_')) {
            try {
                await handleTreatServiceSelection(interaction, client);
            } catch (error) {
                console.error('[❌] Treat interaction error:', error);
                
                try {
                    if (interaction.deferred || interaction.replied) {
                        await interaction.editReply({
                            content: '❌ There was an error processing your selection. Please try again.',
                            components: []
                        });
                    } else {
                        await interaction.reply({
                            content: '❌ There was an error processing your selection. Please try again.',
                            flags: 64
                        });
                    }
                } catch (replyError) {
                    console.error('[❌] Error sending error message:', replyError);
                }
            }
        }
    });

    // Handle delete button for treat messages
    client.on('interactionCreate', async (interaction) => {
        if (!interaction.isButton()) return;

        if (interaction.customId.startsWith('delete_treat_')) {
            await interaction.deferUpdate();
            // Delete logic is handled in the collector above
        }
    });
};

// Auto-cleanup for temp data
setInterval(() => {
    const now = Date.now();
    let cleanedCount = 0;
    
    if (client?.treatTempData) {
        for (const [key, value] of client.treatTempData.entries()) {
            if (now - value.timestamp > 300000) { // 5 phút
                client.treatTempData.delete(key);
                cleanedCount++;
            }
        }
    }
    
    if (cleanedCount > 0) {
        console.log(`[🧹] Auto-cleaned ${cleanedCount} expired treat temp data entries`);
    }
}, 300000); // 5 phút