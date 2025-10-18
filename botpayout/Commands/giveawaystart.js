const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, StringSelectMenuBuilder, ChannelType } = require('discord.js');
const { Pool } = require('pg');

// Neon PostgreSQL Connection
const pool = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgresql://neondb_owner:npg_cL56QelHwXqf@ep-weathered-night-adfcxbnu-pooler.c-2.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require',
    ssl: {
        rejectUnauthorized: false
    }
});

// Initialize database for giveaways
async function initializeGiveawayDatabase() {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS giveaways (
                id SERIAL PRIMARY KEY,
                message_id VARCHAR(50) UNIQUE,
                channel_id VARCHAR(50) NOT NULL,
                guild_id VARCHAR(50) NOT NULL,
                host_id VARCHAR(50) NOT NULL,
                prize TEXT NOT NULL,
                winners INTEGER DEFAULT 1,
                duration BIGINT NOT NULL,
                end_time TIMESTAMP NOT NULL,
                requirements BOOLEAN DEFAULT FALSE,
                service_type VARCHAR(100),
                account_count INTEGER DEFAULT 1,
                created_at TIMESTAMP DEFAULT NOW(),
                ended BOOLEAN DEFAULT FALSE,
                participants TEXT[] DEFAULT '{}'
            );

            CREATE TABLE IF NOT EXISTS giveaway_accounts (
                id SERIAL PRIMARY KEY,
                giveaway_id INTEGER REFERENCES giveaways(id),
                account_data TEXT NOT NULL,
                used BOOLEAN DEFAULT FALSE,
                winner_id VARCHAR(50),
                delivered BOOLEAN DEFAULT FALSE
            );
        `);
        console.log('[✅] Giveaway database initialized');
    } catch (error) {
        console.error('[❌] Giveaway database initialization error:', error);
    }
}

initializeGiveawayDatabase();

// Simple duration parser (thay thế ms package)
function parseDuration(duration) {
    const units = {
        's': 1000,
        'm': 60000,
        'h': 3600000,
        'd': 86400000
    };
    
    const match = duration.match(/(\d+)([smhd])/);
    if (!match) return null;
    
    const value = parseInt(match[1]);
    const unit = match[2];
    
    return value * (units[unit] || 1000);
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('giveawaystart')
        .setDescription('🎉 Start an epic giveaway!')
        .addStringOption(option =>
            option.setName('requirements')
                .setDescription('Require approval or instant delivery?')
                .setRequired(true)
                .addChoices(
                    { name: '📋 Require Approval', value: 'required' },
                    { name: '⚡ Instant Delivery', value: 'instant' }
                ))
        .addStringOption(option =>
            option.setName('duration')
                .setDescription('Duration (e.g., 1h, 30m, 2d)')
                .setRequired(true))
        .addChannelOption(option =>
            option.setName('channel')
                .setDescription('Channel to host giveaway')
                .setRequired(true)
                .addChannelTypes(ChannelType.GuildText))
        .addStringOption(option =>
            option.setName('service')
                .setDescription('Type of service to giveaway')
                .setRequired(true)
                .addChoices(
                    { name: '🎮 Xbox GamePass', value: 'xbox_gamepass' },
                    { name: '⚡ Xbox Ultimate', value: 'xbox_ultimate' },
                    { name: '🌟 Fan Member', value: 'fan_member' },
                    { name: '💎 Mega Fan', value: 'mega_fan' },
                    { name: '⛏️ Minecraft Non-Full', value: 'minecraft_nonfull' },
                    { name: '🔓 Minecraft Full', value: 'minecraft_full' },
                    { name: '🎫 Redeem Code', value: 'redeem_code' },
                    { name: '🟥 Robux', value: 'robux' },
                    { name: '💰 LTC', value: 'ltc' },
                    { name: '🎁 Nitro', value: 'nitro' }
                ))
        .addIntegerOption(option =>
            option.setName('winners')
                .setDescription('Number of winners')
                .setRequired(true)
                .setMinValue(1)
                .setMaxValue(50))
        .addStringOption(option =>
            option.setName('title')
                .setDescription('Custom title for the giveaway')
                .setRequired(true)
                .setMaxLength(100)),

    async execute(interaction) {
        if (!interaction.member.permissions.has('ADMINISTRATOR')) {
            const errorEmbed = new EmbedBuilder()
                .setTitle('🚫 Access Denied')
                .setDescription('You need **Administrator** permissions to start giveaways!')
                .setColor(0xFF0000)
                .setFooter({ text: 'Permission Required' });

            return await interaction.reply({
                embeds: [errorEmbed],
                flags: 64
            });
        }

        const requirements = interaction.options.getString('requirements');
        const duration = interaction.options.getString('duration');
        const channel = interaction.options.getChannel('channel');
        const service = interaction.options.getString('service');
        const winners = interaction.options.getInteger('winners');
        const title = interaction.options.getString('title');

        // Validate duration
        const durationMs = parseDuration(duration);
        if (!durationMs || durationMs < 10000) {
            const errorEmbed = new EmbedBuilder()
                .setTitle('❌ Invalid Duration')
                .setDescription('Please provide a valid duration (e.g., 1h, 30m, 2d) Minimum: 10 seconds\n\n**Examples:**\n• `1h` - 1 hour\n• `30m` - 30 minutes\n• `2d` - 2 days\n• `45s` - 45 seconds')
                .setColor(0xFF0000);

            return await interaction.reply({
                embeds: [errorEmbed],
                flags: 64
            });
        }

        const endTime = Date.now() + durationMs;

        // Service names mapping
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

        const serviceName = serviceNames[service];

        // Create account input modal
        const modal = new ModalBuilder()
            .setCustomId(`giveawayModal_${interaction.id}`)
            .setTitle('🎁 Giveaway Account Details');

        const accountInput = new TextInputBuilder()
            .setCustomId('accountData')
            .setLabel(`Enter ${winners} account(s) (email:password)`)
            .setStyle(TextInputStyle.Paragraph)
            .setPlaceholder(`Enter ${winners} account(s), one per line\nExample:\nemail1:pass1\nemail2:pass2\n...`)
            .setRequired(true);

        const modalRow = new ActionRowBuilder().addComponents(accountInput);
        modal.addComponents(modalRow);

        await interaction.showModal(modal);

        // Store giveaway data temporarily
        const giveawayData = {
            requirements,
            duration: durationMs,
            channel: channel.id,
            service,
            serviceName,
            winners,
            title,
            endTime,
            host: interaction.user
        };

        // Wait for modal submission
        const filter = (modalInteraction) => modalInteraction.customId === modal.data.custom_id;
        
        try {
            const modalInteraction = await interaction.awaitModalSubmit({ filter, time: 300000 }); // 5 minutes
            
            const accountData = modalInteraction.fields.getTextInputValue('accountData');
            const accounts = accountData.split('\n').filter(acc => acc.trim()).slice(0, winners);

            if (accounts.length < winners) {
                const errorEmbed = new EmbedBuilder()
                    .setTitle('❌ Insufficient Accounts')
                    .setDescription(`You provided ${accounts.length} accounts but specified ${winners} winners!\n\nPlease provide exactly ${winners} accounts.`)
                    .setColor(0xFF0000);

                return await modalInteraction.reply({
                    embeds: [errorEmbed],
                    flags: 64
                });
            }

            // Validate account format
            const invalidAccounts = accounts.filter(acc => !acc.includes(':'));
            if (invalidAccounts.length > 0) {
                const errorEmbed = new EmbedBuilder()
                    .setTitle('❌ Invalid Account Format')
                    .setDescription(`Some accounts are not in email:password format:\n${invalidAccounts.slice(0, 3).map(acc => `• ${acc}`).join('\n')}`)
                    .setColor(0xFF0000);

                return await modalInteraction.reply({
                    embeds: [errorEmbed],
                    flags: 64
                });
            }

            // Create the giveaway embed
            const giveawayEmbed = new EmbedBuilder()
                .setTitle(`🎉 ${title}`)
                .setDescription(`**Hosted by:** ${interaction.user}\n**Prize:** ${serviceName}\n**Winners:** 🏆 ${winners}\n**Ends:** <t:${Math.floor(endTime/1000)}:R> (<t:${Math.floor(endTime/1000)}:F>)`)
                .setColor(0xFFD700)
                .addFields(
                    {
                        name: '📋 How to Enter',
                        value: 'Click the **🎁 Enter Giveaway** button below to participate!',
                        inline: false
                    },
                    {
                        name: '⚡ Delivery Type',
                        value: requirements === 'required' ? '📋 Admin Approval Required' : '⚡ Instant Delivery',
                        inline: true
                    },
                    {
                        name: '⏰ Duration',
                        value: `\`${duration}\``,
                        inline: true
                    }
                )
                .setThumbnail('https://cdn.discordapp.com/emojis/1417164913985454162.gif?size=96&quality=lossless')
                .setFooter({ 
                    text: `Giveaway ID: ${Date.now()}`, 
                    iconURL: interaction.user.displayAvatarURL() 
                })
                .setTimestamp();

            const enterButton = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId(`enter_giveaway_${Date.now()}`)
                        .setLabel('🎁 Enter Giveaway')
                        .setStyle(ButtonStyle.Success)
                        .setEmoji('🎁')
                );

            // Send giveaway to specified channel
            const giveawayMessage = await channel.send({
                content: '🎉 **NEW GIVEAWAY STARTED!** 🎉',
                embeds: [giveawayEmbed],
                components: [enterButton]
            });

            // Save giveaway to database
            const giveawayResult = await pool.query(
                `INSERT INTO giveaways 
                 (message_id, channel_id, guild_id, host_id, prize, winners, duration, end_time, requirements, service_type, account_count) 
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) 
                 RETURNING id`,
                [
                    giveawayMessage.id,
                    channel.id,
                    interaction.guild.id,
                    interaction.user.id,
                    serviceName,
                    winners,
                    durationMs,
                    new Date(endTime),
                    requirements === 'required',
                    service,
                    winners
                ]
            );

            const giveawayId = giveawayResult.rows[0].id;

            // Save accounts to database
            for (const account of accounts) {
                await pool.query(
                    'INSERT INTO giveaway_accounts (giveaway_id, account_data) VALUES ($1, $2)',
                    [giveawayId, account.trim()]
                );
            }

            // Success confirmation
            const successEmbed = new EmbedBuilder()
                .setTitle('✅ Giveaway Started!')
                .setDescription(`**${title}** has been successfully started in ${channel}!`)
                .setColor(0x00FF00)
                .addFields(
                    { name: '🎁 Prize', value: serviceName, inline: true },
                    { name: '🏆 Winners', value: winners.toString(), inline: true },
                    { name: '⏰ Duration', value: duration, inline: true },
                    { name: '📋 Approval', value: requirements === 'required' ? 'Required' : 'Instant', inline: true }
                )
                .setFooter({ text: 'Giveaway System • Auto-ending enabled' })
                .setTimestamp();

            await modalInteraction.reply({
                embeds: [successEmbed],
                flags: 64
            });

            // Start countdown
            startGiveawayCountdown(interaction.client, giveawayId, giveawayMessage.id, endTime);

        } catch (error) {
            if (error.code === 'INTERACTION_COLLECTOR_ERROR') {
                const timeoutEmbed = new EmbedBuilder()
                    .setTitle('⏰ Timeout')
                    .setDescription('Giveaway creation cancelled - you took too long to enter account details!')
                    .setColor(0xFFA500);

                await interaction.followUp({
                    embeds: [timeoutEmbed],
                    flags: 64
                });
            } else {
                console.error('Giveaway error:', error);
                const errorEmbed = new EmbedBuilder()
                    .setTitle('❌ Error')
                    .setDescription('There was an error creating the giveaway!')
                    .setColor(0xFF0000);

                await interaction.followUp({
                    embeds: [errorEmbed],
                    flags: 64
                });
            }
        }
    },
};

// Start giveaway countdown
async function startGiveawayCountdown(client, giveawayId, messageId, endTime) {
    const interval = setInterval(async () => {
        try {
            const now = Date.now();
            const remaining = endTime - now;

            if (remaining <= 0) {
                clearInterval(interval);
                await endGiveaway(client, giveawayId, messageId);
                return;
            }

            // Update embed every minute
            if (remaining % 60000 === 0) {
                await updateGiveawayEmbed(client, giveawayId, messageId);
            }
        } catch (error) {
            console.error('Giveaway countdown error:', error);
            clearInterval(interval);
        }
    }, 10000); // Check every 10 seconds
}

// Update giveaway embed
async function updateGiveawayEmbed(client, giveawayId, messageId) {
    try {
        const giveawayResult = await pool.query(
            'SELECT * FROM giveaways WHERE id = $1 AND message_id = $2',
            [giveawayId, messageId]
        );

        if (giveawayResult.rows.length === 0) return;

        const giveaway = giveawayResult.rows[0];
        const channel = await client.channels.fetch(giveaway.channel_id);
        const message = await channel.messages.fetch(giveaway.message_id);

        const participantsCount = giveaway.participants ? giveaway.participants.length : 0;

        const updatedEmbed = new EmbedBuilder()
            .setTitle(message.embeds[0].title)
            .setDescription(`**Hosted by:** <@${giveaway.host_id}>\n**Prize:** ${giveaway.prize}\n**Winners:** 🏆 ${giveaway.winners}\n**Participants:** 👥 ${participantsCount}\n**Ends:** <t:${Math.floor(new Date(giveaway.end_time).getTime()/1000)}:R> (<t:${Math.floor(new Date(giveaway.end_time).getTime()/1000)}:F>)`)
            .setColor(0xFFD700)
            .addFields(
                {
                    name: '📋 How to Enter',
                    value: 'Click the **🎁 Enter Giveaway** button below to participate!',
                    inline: false
                },
                {
                    name: '⚡ Delivery Type',
                    value: giveaway.requirements ? '📋 Admin Approval Required' : '⚡ Instant Delivery',
                    inline: true
                },
                {
                    name: '⏰ Time Left',
                    value: `<t:${Math.floor(new Date(giveaway.end_time).getTime()/1000)}:R>`,
                    inline: true
                }
            )
            .setThumbnail('https://cdn.discordapp.com/emojis/1417164913985454162.gif?size=96&quality=lossless')
            .setFooter({ 
                text: `Giveaway ID: ${giveaway.id}`, 
                iconURL: message.embeds[0].footer?.iconURL 
            })
            .setTimestamp();

        await message.edit({ embeds: [updatedEmbed] });
    } catch (error) {
        console.error('Update giveaway embed error:', error);
    }
}

// End giveaway and pick winners
async function endGiveaway(client, giveawayId, messageId) {
    try {
        const giveawayResult = await pool.query(
            'SELECT * FROM giveaways WHERE id = $1 AND message_id = $2',
            [giveawayId, messageId]
        );

        if (giveawayResult.rows.length === 0) return;

        const giveaway = giveawayResult.rows[0];
        const participants = giveaway.participants || [];

        if (participants.length === 0) {
            // No participants
            const channel = await client.channels.fetch(giveaway.channel_id);
            const message = await channel.messages.fetch(giveaway.message_id);

            const noWinnersEmbed = new EmbedBuilder()
                .setTitle('🎉 Giveaway Ended')
                .setDescription(`**${giveaway.prize}**\n\n❌ **No participants!**\n\nThis giveaway had no entries.`)
                .setColor(0xFF0000)
                .setFooter({ text: 'Giveaway Ended • No winners' })
                .setTimestamp();

            await message.edit({
                embeds: [noWinnersEmbed],
                components: []
            });

            await pool.query(
                'UPDATE giveaways SET ended = true WHERE id = $1',
                [giveawayId]
            );

            return;
        }

        // Pick winners
        const winners = [];
        const winnerIds = [];
        const availableParticipants = [...participants];

        for (let i = 0; i < Math.min(giveaway.winners, participants.length); i++) {
            const randomIndex = Math.floor(Math.random() * availableParticipants.length);
            winners.push(availableParticipants[randomIndex]);
            winnerIds.push(availableParticipants[randomIndex]);
            availableParticipants.splice(randomIndex, 1);
        }

        // Get accounts for winners
        const accountsResult = await pool.query(
            'SELECT * FROM giveaway_accounts WHERE giveaway_id = $1 AND used = false LIMIT $2',
            [giveawayId, winners.length]
        );

        const accounts = accountsResult.rows;

        // Update giveaway as ended
        await pool.query(
            'UPDATE giveaways SET ended = true WHERE id = $1',
            [giveawayId]
        );

        // Mark accounts as used and assign to winners
        for (let i = 0; i < winners.length; i++) {
            if (accounts[i]) {
                await pool.query(
                    'UPDATE giveaway_accounts SET used = true, winner_id = $1 WHERE id = $2',
                    [winners[i], accounts[i].id]
                );
            }
        }

        // Send winner announcement
        const channel = await client.channels.fetch(giveaway.channel_id);
        const message = await channel.messages.fetch(giveaway.message_id);

        const winnersText = winners.map(winner => `<@${winner}>`).join(', ');
        const winnersEmbed = new EmbedBuilder()
            .setTitle('🎉 Giveaway Ended!')
            .setDescription(`**Prize:** ${giveaway.prize}\n**Winners:** ${winnersText}\n\n🎊 **Congratulations to the winners!** 🎊\n\nYou will receive your prize shortly!`)
            .setColor(0x00FF00)
            .setFooter({ text: `Giveaway Ended • ${winners.length} winner(s)` })
            .setTimestamp()
            .setThumbnail('https://cdn.discordapp.com/emojis/1417165332556152922.png?size=96&quality=lossless');

        await message.edit({
            content: '🎉 **GIVEAWAY ENDED!** 🎉',
            embeds: [winnersEmbed],
            components: []
        });

        // Deliver prizes
        for (let i = 0; i < winners.length; i++) {
            const winnerId = winners[i];
            const account = accounts[i];
            
            if (account) {
                await deliverGiveawayPrize(client, winnerId, giveaway, account);
            }
        }

    } catch (error) {
        console.error('End giveaway error:', error);
    }
}

// Deliver giveaway prize
async function deliverGiveawayPrize(client, winnerId, giveaway, account) {
    try {
        const winner = await client.users.fetch(winnerId);
        const [email, password] = account.account_data.split(':');

        if (giveaway.requirements) {
            // Send to approval channel
            const approvalChannel = await client.channels.fetch('1426228523160436929');
            
            const approvalEmbed = new EmbedBuilder()
                .setTitle('📋 Giveaway Prize Approval')
                .setDescription(`**Winner:** ${winner}\n**Prize:** ${giveaway.prize}\n**Giveaway:** ${giveaway.prize}`)
                .setColor(0xF39C12)
                .addFields(
                    { name: '👤 Winner', value: `${winner.tag}\n(${winner.id})`, inline: true },
                    { name: '🎁 Prize', value: giveaway.prize, inline: true },
                    { name: '📧 Account', value: `||${email}||`, inline: false }
                )
                .setFooter({ text: 'Giveaway Prize Approval' })
                .setTimestamp();

            const approvalButtons = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId(`approve_giveaway_${giveaway.id}_${winnerId}`)
                        .setLabel('✅ Approve Delivery')
                        .setStyle(ButtonStyle.Success)
                        .setEmoji('✅'),
                    new ButtonBuilder()
                        .setCustomId(`deny_giveaway_${giveaway.id}_${winnerId}`)
                        .setLabel('❌ Deny Delivery')
                        .setStyle(ButtonStyle.Danger)
                        .setEmoji('❌')
                );

            await approvalChannel.send({
                content: '📢 Giveaway prize requires approval!',
                embeds: [approvalEmbed],
                components: [approvalButtons]
            });

            // Notify winner
            const pendingEmbed = new EmbedBuilder()
                .setTitle('⏳ Prize Pending Approval')
                .setDescription(`You won **${giveaway.prize}** in the giveaway!\n\nYour prize is pending admin approval and will be delivered soon.`)
                .setColor(0xF39C12)
                .setFooter({ text: 'Approval required • Please wait' })
                .setTimestamp();

            await winner.send({ embeds: [pendingEmbed] });

        } else {
            // Instant delivery
            const prizeEmbed = new EmbedBuilder()
                .setTitle(`🎁 You Won: ${giveaway.prize}!`)
                .setDescription('Congratulations! Here is your prize:')
                .setColor(0x00FF00)
                .addFields(
                    { name: '📧 Email', value: `\`\`\`${email}\`\`\``, inline: false },
                    { name: '🔑 Password', value: `\`\`\`${password}\`\`\``, inline: false }
                )
                .addFields(
                    {
                        name: '📝 Vouch Instructions',
                        value: `Please submit your vouch in <#1423687881771319380> using:\n\`+vouch Your vouch message here\`\n\nYou have **2 DAYS** to submit your vouch or you will be **BANNED FROM FUTURE EVENTS**!`,
                        inline: false
                    }
                )
                .setFooter({ text: 'Congratulations! • Enjoy your prize' })
                .setTimestamp();

            // Add full access guide for FA accounts
            const faAccounts = ['xbox_gamepass', 'xbox_ultimate', 'fan_member', 'mega_fan', 'minecraft_full'];
            if (faAccounts.includes(giveaway.service_type)) {
                prizeEmbed.addFields({
                    name: '📖 How To Get Full Access',
                    value: 'Here Is How To Get Full Access!\nhttps://drive.google.com/file/u/0/d/1X1H3vy1UKJPEv5kiBp60LBMCm4AktH29/view?pli=1',
                    inline: false
                });
            }

            await winner.send({ embeds: [prizeEmbed] });

            // Mark as delivered
            await pool.query(
                'UPDATE giveaway_accounts SET delivered = true WHERE id = $1',
                [account.id]
            );

            // Record payout for vouch tracking
            await pool.query(
                'INSERT INTO payouts (user_id, user_name, reward_type, status) VALUES ($1, $2, $3, $4)',
                [winner.id, winner.tag, giveaway.service_type, 'delivered']
            );
        }

    } catch (error) {
        console.error('Deliver giveaway prize error:', error);
    }
}

// Handle giveaway interactions
module.exports.handleInteractions = (client) => {
    console.log('[🎉] Setting up giveaway interactions...');

    client.on('interactionCreate', async (interaction) => {
        if (!interaction.isButton()) return;

        console.log(`[🎉] Giveaway interaction: ${interaction.customId}`);

        // Enter giveaway button
        if (interaction.customId.startsWith('enter_giveaway')) {
            await handleEnterGiveaway(interaction);
        }
        
        // Approve/deny giveaway prize buttons
        if (interaction.customId.startsWith('approve_giveaway')) {
            await handleApproveGiveawayPrize(interaction);
        }
        
        if (interaction.customId.startsWith('deny_giveaway')) {
            await handleDenyGiveawayPrize(interaction);
        }
    });
};

// Handle enter giveaway
async function handleEnterGiveaway(interaction) {
    try {
        const messageId = interaction.message.id;
        
        const giveawayResult = await pool.query(
            'SELECT * FROM giveaways WHERE message_id = $1 AND ended = false',
            [messageId]
        );

        if (giveawayResult.rows.length === 0) {
            const errorEmbed = new EmbedBuilder()
                .setTitle('❌ Giveaway Ended')
                .setDescription('This giveaway has already ended!')
                .setColor(0xFF0000);

            return await interaction.reply({
                embeds: [errorEmbed],
                flags: 64
            });
        }

        const giveaway = giveawayResult.rows[0];
        const participants = giveaway.participants || [];

        // Check if already entered
        if (participants.includes(interaction.user.id)) {
            const alreadyEnteredEmbed = new EmbedBuilder()
                .setTitle('✅ Already Entered')
                .setDescription('You have already entered this giveaway!')
                .setColor(0xF39C12)
                .setFooter({ text: 'Good luck! 🍀' });

            return await interaction.reply({
                embeds: [alreadyEnteredEmbed],
                flags: 64
            });
        }

        // Add participant
        participants.push(interaction.user.id);
        
        await pool.query(
            'UPDATE giveaways SET participants = $1 WHERE message_id = $2',
            [participants, messageId]
        );

        // Success embed
        const successEmbed = new EmbedBuilder()
            .setTitle('🎉 Entry Confirmed!')
            .setDescription(`You have successfully entered the **${giveaway.prize}** giveaway!\n\n**Good luck!** 🍀`)
            .setColor(0x00FF00)
            .addFields(
                { name: '🏆 Winners', value: giveaway.winners.toString(), inline: true },
                { name: '👥 Participants', value: participants.length.toString(), inline: true },
                { name: '⏰ Ends', value: `<t:${Math.floor(new Date(giveaway.end_time).getTime()/1000)}:R>`, inline: true }
            )
            .setFooter({ text: 'Giveaway Entry • Winners announced soon' })
            .setTimestamp();

        await interaction.reply({
            embeds: [successEmbed],
            flags: 64
        });

        // Update participant count in original message
        await updateGiveawayEmbed(interaction.client, giveaway.id, messageId);

    } catch (error) {
        console.error('Enter giveaway error:', error);
        
        const errorEmbed = new EmbedBuilder()
            .setTitle('❌ Error')
            .setDescription('There was an error entering the giveaway!')
            .setColor(0xFF0000);

        await interaction.reply({
            embeds: [errorEmbed],
            flags: 64
        });
    }
}

// Handle approve giveaway prize
async function handleApproveGiveawayPrize(interaction) {
    if (!interaction.member.permissions.has('ADMINISTRATOR')) {
        return await interaction.reply({
            content: '❌ Administrator permissions required!',
            flags: 64
        });
    }

    const parts = interaction.customId.split('_');
    const giveawayId = parts[2];
    const winnerId = parts[3];
    
    // Get account data
    const accountResult = await pool.query(
        'SELECT * FROM giveaway_accounts WHERE giveaway_id = $1 AND winner_id = $2',
        [giveawayId, winnerId]
    );

    if (accountResult.rows.length === 0) {
        return await interaction.reply({
            content: '❌ Account not found!',
            flags: 64
        });
    }

    const account = accountResult.rows[0];
    const [email, password] = account.account_data.split(':');
    
    const winner = await interaction.client.users.fetch(winnerId);
    const giveawayResult = await pool.query('SELECT * FROM giveaways WHERE id = $1', [giveawayId]);
    const giveaway = giveawayResult.rows[0];

    // Deliver prize
    const prizeEmbed = new EmbedBuilder()
        .setTitle(`🎁 You Won: ${giveaway.prize}!`)
        .setDescription('Congratulations! Here is your prize:')
        .setColor(0x00FF00)
        .addFields(
            { name: '📧 Email', value: `\`\`\`${email}\`\`\``, inline: false },
            { name: '🔑 Password', value: `\`\`\`${password}\`\`\``, inline: false }
        )
        .addFields(
            {
                name: '📝 Vouch Instructions',
                value: `Please submit your vouch in <#1423687881771319380> using:\n\`+vouch Your vouch message here\`\n\nYou have **2 DAYS** to submit your vouch or you will be **BANNED FROM FUTURE EVENTS**!`,
                inline: false
            }
        )
        .setFooter({ text: 'Congratulations! • Admin approved' })
        .setTimestamp();

    // Add full access guide for FA accounts
    const faAccounts = ['xbox_gamepass', 'xbox_ultimate', 'fan_member', 'mega_fan', 'minecraft_full'];
    if (faAccounts.includes(giveaway.service_type)) {
        prizeEmbed.addFields({
            name: '📖 How To Get Full Access',
            value: 'Here Is How To Get Full Access!\nhttps://drive.google.com/file/u/0/d/1X1H3vy1UKJPEv5kiBp60LBMCm4AktH29/view?pli=1',
            inline: false
        });
    }

    await winner.send({ embeds: [prizeEmbed] });

    // Mark as delivered
    await pool.query(
        'UPDATE giveaway_accounts SET delivered = true WHERE id = $1',
        [account.id]
    );

    // Record payout for vouch tracking
    await pool.query(
        'INSERT INTO payouts (user_id, user_name, reward_type, status) VALUES ($1, $2, $3, $4)',
        [winner.id, winner.tag, giveaway.service_type, 'delivered']
    );

    // Update approval message
    const approvedEmbed = EmbedBuilder.from(interaction.message.embeds[0])
        .setTitle('✅ Prize Delivered')
        .setColor(0x00FF00)
        .addFields(
            { name: '✅ Approved by', value: interaction.user.tag, inline: true },
            { name: '🕒 Delivered at', value: `<t:${Math.floor(Date.now()/1000)}:T>`, inline: true }
        );

    await interaction.message.edit({
        embeds: [approvedEmbed],
        components: []
    });

    await interaction.reply({
        content: `✅ Prize delivered to ${winner.tag}!`,
        flags: 64
    });
}

// Handle deny giveaway prize
async function handleDenyGiveawayPrize(interaction) {
    if (!interaction.member.permissions.has('ADMINISTRATOR')) {
        return await interaction.reply({
            content: '❌ Administrator permissions required!',
            flags: 64
        });
    }

    const parts = interaction.customId.split('_');
    const giveawayId = parts[2];
    const winnerId = parts[3];
    const winner = await interaction.client.users.fetch(winnerId);

    // Update approval message
    const deniedEmbed = EmbedBuilder.from(interaction.message.embeds[0])
        .setTitle('❌ Prize Denied')
        .setColor(0xFF0000)
        .addFields(
            { name: '❌ Denied by', value: interaction.user.tag, inline: true },
            { name: '🕒 Denied at', value: `<t:${Math.floor(Date.now()/1000)}:T>`, inline: true }
        );

    await interaction.message.edit({
        embeds: [deniedEmbed],
        components: []
    });

    // Notify winner
    try {
        const denyEmbed = new EmbedBuilder()
            .setTitle('❌ Prize Denied')
            .setDescription('Your giveaway prize has been denied by admin.')
            .setColor(0xFF0000)
            .addFields(
                { name: 'Reason', value: 'Contact admin for more information.', inline: false }
            )
            .setTimestamp();

        await winner.send({ embeds: [denyEmbed] });
    } catch (error) {
        console.log('Could not DM winner about denial');
    }

    await interaction.reply({
        content: `❌ Prize denied for ${winner.tag}!`,
        flags: 64
    });
}