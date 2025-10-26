const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

const ALLOWED_CHANNEL_ID = '1431900224028151918';
const VOUCH_CHANNEL_ID = '1431929181054173214';
const PREMIUM_SERVICES = ['minecraft', 'xboxul', 'unban'];
const COOLDOWN_TIME = 60 * 60 * 1000;
const VOUCH_TIMEOUT = 10 * 60 * 1000;

// Premium service configurations
const SERVICE_CONFIGS = {
    minecraft: {
        color: 0x00FF00,
        emoji: '⛏️',
        name: 'Minecraft Premium',
        thumbnail: 'https://i.imgur.com/8eTQz5J.png'
    },
    xboxul: {
        color: 0x107C10,
        emoji: '🎮',
        name: 'Xbox Ultimate',
        thumbnail: 'https://i.imgur.com/G4qzkWp.png'
    },
    unban: {
        color: 0xFF0000,
        emoji: '🔓',
        name: 'Account Unban',
        thumbnail: 'https://i.imgur.com/3JQZb8j.png'
    }
};

module.exports = {
    data: {
        name: 'premium',
        description: 'Get a premium account (Minecraft, Xbox Ultimate or Unban)'
    },
    
    async execute(message, args, client) {
        if (message.channel.id !== ALLOWED_CHANNEL_ID) {
            const wrongChannelEmbed = new EmbedBuilder()
                .setColor(0xFF0000)
                .setTitle('🚫 Channel Restriction')
                .setDescription(`This command can only be used in <#${ALLOWED_CHANNEL_ID}>`)
                .setFooter({ text: 'Channel Access Denied', iconURL: message.client.user.displayAvatarURL() })
                .setTimestamp();

            return await message.reply({
                embeds: [wrongChannelEmbed],
                ephemeral: true
            });
        }

        if (client.userCooldowns.has(message.author.id)) {
            const cooldownEnd = client.userCooldowns.get(message.author.id);
            if (Date.now() < cooldownEnd) {
                const remainingTime = Math.ceil((cooldownEnd - Date.now()) / 1000 / 60);
                const remainingSeconds = Math.ceil((cooldownEnd - Date.now()) / 1000 % 60);
                
                const cooldownEmbed = new EmbedBuilder()
                    .setColor(0xFFA500)
                    .setTitle('⏰ Command Cooldown')
                    .setDescription(`You're currently on cooldown! Please wait before using this command again.`)
                    .addFields(
                        {
                            name: '🕒 Remaining Time',
                            value: `**${remainingTime} minutes ${remainingSeconds} seconds**`,
                            inline: true
                        },
                        {
                            name: '📝 Reason',
                            value: 'Cooldown for not vouching or recent usage',
                            inline: true
                        }
                    )
                    .setThumbnail('https://i.imgur.com/6G6Wp1A.png')
                    .setTimestamp();

                return await message.reply({
                    embeds: [cooldownEmbed],
                    ephemeral: true
                });
            }
        }

        try {
            const result = await client.pool.query(
                `SELECT * FROM stocks WHERE service IN ($1, $2, $3) ORDER BY RANDOM() LIMIT 1`,
                PREMIUM_SERVICES
            );

            if (result.rows.length === 0) {
                const noStockEmbed = new EmbedBuilder()
                    .setColor(0xFF0000)
                    .setTitle('💔 Out of Stock')
                    .setDescription('We are currently out of premium accounts!')
                    .addFields(
                        {
                            name: '📊 Available Services',
                            value: PREMIUM_SERVICES.map(service => `• ${SERVICE_CONFIGS[service]?.name || service}`).join('\n'),
                            inline: true
                        },
                        {
                            name: '🔄 What to do?',
                            value: 'Please check back later or contact staff for restock updates',
                            inline: true
                        }
                    )
                    .setThumbnail('https://i.imgur.com/3v2Q5aA.png')
                    .setFooter({ text: 'Restock Coming Soon', iconURL: message.client.user.displayAvatarURL() })
                    .setTimestamp();

                return await message.reply({
                    embeds: [noStockEmbed],
                    ephemeral: true
                });
            }

            const account = result.rows[0];
            const [email, password] = [account.email, account.password];
            const serviceConfig = SERVICE_CONFIGS[account.service] || {
                color: 0x9c27b0,
                emoji: '💎',
                name: account.service.toUpperCase(),
                thumbnail: message.client.user.displayAvatarURL()
            };

            await client.pool.query(
                'DELETE FROM stocks WHERE id = $1',
                [account.id]
            );

            // Main Account Embed
            const accountEmbed = new EmbedBuilder()
                .setColor(serviceConfig.color)
                .setTitle(`${serviceConfig.emoji} PREMIUM ${serviceConfig.name.toUpperCase()} ACCOUNT`)
                .setDescription(`**Thank you for choosing our premium service! 🎉**`)
                .setThumbnail(serviceConfig.thumbnail)
                .addFields(
                    {
                        name: `${serviceConfig.emoji} Service Type`,
                        value: `**${serviceConfig.name}**`,
                        inline: true
                    },
                    {
                        name: '🆔 Account ID',
                        value: `\`${account.id}\``,
                        inline: true
                    },
                    {
                        name: '📅 Generated',
                        value: `<t:${Math.floor(Date.now() / 1000)}:R>`,
                        inline: true
                    },
                    {
                        name: '━━━━━━━━━━━━━━━━━━━━',
                        value: '**ACCOUNT CREDENTIALS**',
                        inline: false
                    },
                    {
                        name: '📧 EMAIL',
                        value: `\`\`\`fix\n${email}\n\`\`\``,
                        inline: false
                    },
                    {
                        name: '🔑 PASSWORD',
                        value: `\`\`\`yaml\n${password}\n\`\`\``,
                        inline: false
                    },
                    {
                        name: '📝 FULL FORMAT',
                        value: `\`\`\`${email}:${password}\`\`\``,
                        inline: false
                    },
                    {
                        name: '━━━━━━━━━━━━━━━━━━━━',
                        value: '**IMPORTANT INFORMATION**',
                        inline: false
                    },
                    {
                        name: '📢 VOUCH REQUIREMENT',
                        value: `Please vouch in <#${VOUCH_CHANNEL_ID}> with:\n\`\`\`diff\n+legit got account from ${client.user.username}\n\`\`\``,
                        inline: false
                    },
                    {
                        name: '⏰ Time Limit',
                        value: `**10 MINUTES** to vouch`,
                        inline: true
                    },
                    {
                        name: '⏳ Cooldown',
                        value: `**1 HOUR** if no vouch`,
                        inline: true
                    }
                )
                .setFooter({ 
                    text: `Premium Service • ${serviceConfig.name} | Generated for ${message.author.tag}`,
                    iconURL: message.author.displayAvatarURL() 
                })
                .setTimestamp();

            // Instructions Embed
            const instructionsEmbed = new EmbedBuilder()
                .setColor(0x0099FF)
                .setTitle('📋 HOW TO USE YOUR ACCOUNT')
                .setDescription('Follow these steps to access your premium account:')
                .addFields(
                    {
                        name: '1️⃣ Login Steps',
                        value: '• Use the credentials above to login\n• Change password immediately if possible\n• Secure your account with 2FA',
                        inline: false
                    },
                    {
                        name: '2️⃣ Support',
                        value: '• Contact staff if account doesn\'t work\n• Report any issues immediately\n• Keep your receipt safe',
                        inline: false
                    },
                    {
                        name: '3️⃣ Vouching',
                        value: `• Vouch in <#${VOUCH_CHANNEL_ID}>\n• Use the exact format provided\n• Help our community grow!`,
                        inline: false
                    }
                )
                .setFooter({ text: 'Need Help? Contact Staff!', iconURL: message.client.user.displayAvatarURL() })
                .setTimestamp();

            const row = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setLabel('📢 Vouch Channel')
                        .setStyle(ButtonStyle.Link)
                        .setURL(`https://discord.com/channels/${message.guild.id}/${VOUCH_CHANNEL_ID}`),
                    new ButtonBuilder()
                        .setLabel('🔄 Get Another')
                        .setStyle(ButtonStyle.Secondary)
                        .setCustomId('premium_another')
                        .setEmoji('🔁'),
                    new ButtonBuilder()
                        .setLabel('❓ Support')
                        .setStyle(ButtonStyle.Secondary)
                        .setCustomId('premium_support')
                        .setEmoji('💁')
                );

            try {
                await message.author.send({
                    content: `**🎉 CONGRATULATIONS! Here's Your Premium ${serviceConfig.name} Account!**`,
                    embeds: [accountEmbed, instructionsEmbed],
                    components: [row]
                });

                const successEmbed = new EmbedBuilder()
                    .setColor(0x00FF00)
                    .setTitle('✅ Check Your DMs!')
                    .setDescription(`**Your premium ${serviceConfig.name} account has been sent to your DMs!**`)
                    .addFields(
                        {
                            name: '⏰ Reminder',
                            value: `Please vouch within **10 minutes** in <#${VOUCH_CHANNEL_ID}>`,
                            inline: true
                        },
                        {
                            name: '📝 Vouch Format',
                            value: `\`+legit got account from ${client.user.username}\``,
                            inline: true
                        }
                    )
                    .setThumbnail('https://i.imgur.com/7W6h7z4.png')
                    .setFooter({ text: 'Thank you for using our service!', iconURL: message.client.user.displayAvatarURL() })
                    .setTimestamp();

                await message.reply({
                    embeds: [successEmbed],
                    ephemeral: true
                });

            } catch (dmError) {
                const dmErrorEmbed = new EmbedBuilder()
                    .setColor(0xFF0000)
                    .setTitle('❌ DM Delivery Failed')
                    .setDescription('I cannot send you the account via DMs!')
                    .addFields(
                        {
                            name: '🔧 Solution',
                            value: '1. Enable DMs from server members\n2. Check privacy settings\n3. Try again after enabling DMs',
                            inline: false
                        },
                        {
                            name: '📱 Still Issues?',
                            value: 'Contact server staff for alternative delivery',
                            inline: false
                        }
                    )
                    .setThumbnail('https://i.imgur.com/3v2Q5aA.png')
                    .setFooter({ text: 'DM Settings Required', iconURL: message.client.user.displayAvatarURL() })
                    .setTimestamp();

                return await message.reply({
                    embeds: [dmErrorEmbed],
                    ephemeral: true
                });
            }

            // Set vouch timeout with enhanced tracking
            client.pendingVouches.set(message.author.id, {
                timestamp: Date.now(),
                type: 'premium',
                service: account.service,
                accountId: account.id,
                vouchChannel: VOUCH_CHANNEL_ID,
                vouchMessage: `+legit got account from ${client.user.username}`
            });

            setTimeout(async () => {
                if (client.pendingVouches.has(message.author.id)) {
                    client.userCooldowns.set(message.author.id, Date.now() + COOLDOWN_TIME);
                    const pendingVouch = client.pendingVouches.get(message.author.id);
                    client.pendingVouches.delete(message.author.id);
                    
                    try {
                        const timeoutEmbed = new EmbedBuilder()
                            .setColor(0xFFA500)
                            .setTitle('⏰ Vouch Time Expired')
                            .setDescription('You did not vouch within the required time frame!')
                            .addFields(
                                {
                                    name: '🔒 Cooldown Activated',
                                    value: 'You cannot use premium commands for **1 hour**',
                                    inline: true
                                },
                                {
                                    name: '📢 Missed Vouch',
                                    value: `You were supposed to vouch in <#${pendingVouch.vouchChannel}>`,
                                    inline: true
                                },
                                {
                                    name: '🔄 Next Chance',
                                    value: `<t:${Math.floor((Date.now() + COOLDOWN_TIME) / 1000)}:R>`,
                                    inline: false
                                }
                            )
                            .setFooter({ text: 'Cooldown Active', iconURL: message.client.user.displayAvatarURL() })
                            .setTimestamp();

                        await message.author.send({
                            embeds: [timeoutEmbed]
                        });
                    } catch (error) {
                        console.log('Could not send cooldown DM to user');
                    }
                }
            }, VOUCH_TIMEOUT);

        } catch (error) {
            console.error('Error in premium command:', error);
            
            const errorEmbed = new EmbedBuilder()
                .setColor(0xFF0000)
                .setTitle('💥 System Error')
                .setDescription('An unexpected error occurred while processing your request!')
                .addFields(
                    {
                        name: '🔧 Technical Details',
                        value: 'Our system encountered an issue. Please try again later.',
                        inline: false
                    },
                    {
                        name: '📞 Support',
                        value: 'If this persists, contact server staff immediately',
                        inline: false
                    }
                )
                .setThumbnail('https://i.imgur.com/3v2Q5aA.png')
                .setFooter({ text: 'System Error', iconURL: message.client.user.displayAvatarURL() })
                .setTimestamp();

            await message.reply({
                embeds: [errorEmbed],
                ephemeral: true
            });
        }
    }
};