const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

const ALLOWED_CHANNEL_ID = '1431900224028151915';
const VOUCH_CHANNEL_ID = '1431929181054173214';
const FREE_SERVICES = ['minecraft', 'xboxgp'];
const COOLDOWN_TIME = 60 * 60 * 1000;
const VOUCH_TIMEOUT = 10 * 60 * 1000;

// Free service configurations
const SERVICE_CONFIGS = {
    minecraft: {
        color: 0x55FF55,
        emoji: '🧱',
        name: 'Minecraft Free',
        thumbnail: 'https://i.imgur.com/8eTQz5J.png',
        banner: '🎮 FREE MINECRAFT ACCOUNT'
    },
    xboxgp: {
        color: 0x107C10,
        emoji: '🎯',
        name: 'Xbox Game Pass',
        thumbnail: 'https://i.imgur.com/G4qzkWp.png',
        banner: '📀 FREE XBOX GAME PASS'
    }
};

module.exports = {
    data: {
        name: 'free',
        description: 'Get a free account (Minecraft or Xbox Game Pass)'
    },
    
    async execute(message, args, client) {
        // Enhanced channel check with embed
        if (message.channel.id !== ALLOWED_CHANNEL_ID) {
            const channelEmbed = new EmbedBuilder()
                .setColor(0xFF4444)
                .setTitle('🚫 Incorrect Channel')
                .setDescription(`**This command can only be used in:**\n<#${ALLOWED_CHANNEL_ID}>`)
                .addFields(
                    {
                        name: '📌 Current Channel',
                        value: `${message.channel}`,
                        inline: true
                    },
                    {
                        name: '📍 Required Channel',
                        value: `<#${ALLOWED_CHANNEL_ID}>`,
                        inline: true
                    }
                )
                .setFooter({ 
                    text: 'Channel Restriction • Free Accounts', 
                    iconURL: message.client.user.displayAvatarURL() 
                })
                .setTimestamp();

            return await message.reply({
                embeds: [channelEmbed],
                ephemeral: true
            });
        }

        // Enhanced cooldown check
        if (client.userCooldowns.has(message.author.id)) {
            const cooldownEnd = client.userCooldowns.get(message.author.id);
            if (Date.now() < cooldownEnd) {
                const remainingMinutes = Math.floor((cooldownEnd - Date.now()) / 1000 / 60);
                const remainingSeconds = Math.floor((cooldownEnd - Date.now()) / 1000 % 60);
                
                const cooldownEmbed = new EmbedBuilder()
                    .setColor(0xFFAA00)
                    .setTitle('⏰ Command Cooldown Active')
                    .setDescription('You have recently used a free account command and are currently on cooldown.')
                    .addFields(
                        {
                            name: '🕒 Time Remaining',
                            value: `**${remainingMinutes}m ${remainingSeconds}s**`,
                            inline: true
                        },
                        {
                            name: '📅 Cooldown Ends',
                            value: `<t:${Math.floor(cooldownEnd / 1000)}:R>`,
                            inline: true
                        },
                        {
                            name: '💡 Reason',
                            value: 'Previous account usage cooldown period',
                            inline: false
                        }
                    )
                    .setThumbnail('https://i.imgur.com/6G6Wp1A.png')
                    .setFooter({ 
                        text: `Cooldown • ${message.author.tag}`, 
                        iconURL: message.author.displayAvatarURL() 
                    })
                    .setTimestamp();

                return await message.reply({
                    embeds: [cooldownEmbed],
                    ephemeral: true
                });
            }
        }

        try {
            // Get random account from free services
            const result = await client.pool.query(
                `SELECT * FROM stocks WHERE service IN ($1, $2) ORDER BY RANDOM() LIMIT 1`,
                FREE_SERVICES
            );

            // Enhanced no stock embed
            if (result.rows.length === 0) {
                const noStockEmbed = new EmbedBuilder()
                    .setColor(0xFF4444)
                    .setTitle('💔 Out of Free Accounts')
                    .setDescription('We are currently out of free accounts! Please check back later.')
                    .addFields(
                        {
                            name: '📊 Available Services',
                            value: FREE_SERVICES.map(service => 
                                `• ${SERVICE_CONFIGS[service]?.name || service.toUpperCase()}`
                            ).join('\n'),
                            inline: true
                        },
                        {
                            name: '🔄 Restock Info',
                            value: 'Free accounts are restocked regularly\nCheck announcements for updates',
                            inline: true
                        },
                        {
                            name: '💎 Premium Option',
                            value: 'Consider premium accounts for instant access',
                            inline: false
                        }
                    )
                    .setThumbnail('https://i.imgur.com/3v2Q5aA.png')
                    .setFooter({ 
                        text: 'Free Accounts • Restock Soon', 
                        iconURL: message.client.user.displayAvatarURL() 
                    })
                    .setTimestamp();

                return await message.reply({
                    embeds: [noStockEmbed],
                    ephemeral: true
                });
            }

            const account = result.rows[0];
            const [email, password] = [account.email, account.password];
            const serviceConfig = SERVICE_CONFIGS[account.service] || {
                color: 0x00FF00,
                emoji: '🎁',
                name: account.service.toUpperCase(),
                thumbnail: message.client.user.displayAvatarURL(),
                banner: '🎁 FREE ACCOUNT'
            };

            // Delete the account from database
            await client.pool.query(
                'DELETE FROM stocks WHERE id = $1',
                [account.id]
            );

            // Main Account Embed
            const accountEmbed = new EmbedBuilder()
                .setColor(serviceConfig.color)
                .setTitle(`${serviceConfig.emoji} ${serviceConfig.banner}`)
                .setDescription(`**Enjoy your free account! Thank you for being part of our community! 🎉**`)
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
                        name: '📧 EMAIL ADDRESS',
                        value: `\`\`\`fix\n${email}\n\`\`\``,
                        inline: false
                    },
                    {
                        name: '🔑 PASSWORD',
                        value: `\`\`\`yaml\n${password}\n\`\`\``,
                        inline: false
                    },
                    {
                        name: '📝 FULL FORMAT (Copy Paste)',
                        value: `\`\`\`${email}:${password}\`\`\``,
                        inline: false
                    },
                    {
                        name: '━━━━━━━━━━━━━━━━━━━━',
                        value: '**VOUCHING REQUIREMENTS**',
                        inline: false
                    },
                    {
                        name: '📢 VOUCH MESSAGE',
                        value: `Please vouch in <#${VOUCH_CHANNEL_ID}> with this exact message:\n\`\`\`diff\n+legit got account from ${client.user.username}\n\`\`\``,
                        inline: false
                    },
                    {
                        name: '⏰ Time Limit',
                        value: `**10 MINUTES** to complete vouch`,
                        inline: true
                    },
                    {
                        name: '⏳ Penalty',
                        value: `**1 HOUR** cooldown if no vouch`,
                        inline: true
                    }
                )
                .setFooter({ 
                    text: `Free Service • ${serviceConfig.name} | Generated for ${message.author.tag}`,
                    iconURL: message.author.displayAvatarURL() 
                })
                .setTimestamp();

            // Instructions Embed
            const instructionsEmbed = new EmbedBuilder()
                .setColor(0x55AAFF)
                .setTitle('📋 ACCOUNT USAGE GUIDE')
                .setDescription('Follow these steps to successfully use your free account:')
                .addFields(
                    {
                        name: '1️⃣ Login Instructions',
                        value: '• Use provided credentials to login\n• Change password if possible\n• Enable 2FA for security\n• Test account immediately',
                        inline: false
                    },
                    {
                        name: '2️⃣ Common Issues',
                        value: '• Account already used? Contact staff\n• Login not working? Report immediately\n• Need help? Ask in support channel',
                        inline: false
                    },
                    {
                        name: '3️⃣ Community Support',
                        value: '• Vouch helps our community grow\n• Share your experience\n• Help others get accounts too!',
                        inline: false
                    }
                )
                .setFooter({ 
                    text: 'Need Help? Contact Our Support Team!', 
                    iconURL: message.client.user.displayAvatarURL() 
                })
                .setTimestamp();

            // Enhanced Action Row with multiple buttons
            const row = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setLabel('📢 Vouch Channel')
                        .setStyle(ButtonStyle.Link)
                        .setURL(`https://discord.com/channels/${message.guild.id}/${VOUCH_CHANNEL_ID}`)
                        .setEmoji('📢'),
                    new ButtonBuilder()
                        .setLabel('🆘 Get Help')
                        .setStyle(ButtonStyle.Secondary)
                        .setCustomId('free_support')
                        .setEmoji('🆘'),
                    new ButtonBuilder()
                        .setLabel('📊 Check Stock')
                        .setStyle(ButtonStyle.Secondary)
                        .setCustomId('free_stock')
                        .setEmoji('📊')
                );

            // Send account to DM with enhanced messaging
            try {
                await message.author.send({
                    content: `**${serviceConfig.emoji} CONGRATULATIONS! Your FREE ${serviceConfig.name} Account Is Ready!**`,
                    embeds: [accountEmbed, instructionsEmbed],
                    components: [row]
                });

                // Success response embed
                const successEmbed = new EmbedBuilder()
                    .setColor(0x55FF55)
                    .setTitle('✅ Check Your Direct Messages!')
                    .setDescription(`**Your free ${serviceConfig.name} account has been delivered to your DMs!**`)
                    .addFields(
                        {
                            name: '📨 Delivery Status',
                            value: '✅ Successfully sent to DMs',
                            inline: true
                        },
                        {
                            name: '⏰ Vouch Timer',
                            value: '**10 minutes** starts now!',
                            inline: true
                        },
                        {
                            name: '📢 Vouch Channel',
                            value: `<#${VOUCH_CHANNEL_ID}>`,
                            inline: true
                        },
                        {
                            name: '💬 Vouch Message',
                            value: `\`+legit got account from ${client.user.username}\``,
                            inline: false
                        }
                    )
                    .setThumbnail('https://i.imgur.com/7W6h7z4.png')
                    .setFooter({ 
                        text: 'Thank you for supporting our community!', 
                        iconURL: message.client.user.displayAvatarURL() 
                    })
                    .setTimestamp();

                await message.reply({
                    embeds: [successEmbed],
                    ephemeral: true
                });

            } catch (dmError) {
                // Enhanced DM error embed
                const dmErrorEmbed = new EmbedBuilder()
                    .setColor(0xFF4444)
                    .setTitle('❌ Cannot Deliver to DMs')
                    .setDescription('I am unable to send you the account via Direct Messages!')
                    .addFields(
                        {
                            name: '🔧 Quick Fixes',
                            value: '• Enable DMs from server members\n• Check privacy settings\n• Allow messages from this server',
                            inline: false
                        },
                        {
                            name: '📱 Step-by-Step',
                            value: '1. Server Settings → Privacy\n2. Allow Direct Messages\n3. Try the command again',
                            inline: false
                        },
                        {
                            name: '🆘 Still Issues?',
                            value: 'Contact server staff for assistance',
                            inline: false
                        }
                    )
                    .setThumbnail('https://i.imgur.com/3v2Q5aA.png')
                    .setFooter({ 
                        text: 'DM Delivery Failed • Enable DMs to Continue', 
                        iconURL: message.client.user.displayAvatarURL() 
                    })
                    .setTimestamp();

                return await message.reply({
                    embeds: [dmErrorEmbed],
                    ephemeral: true
                });
            }

            // Enhanced vouch tracking
            client.pendingVouches.set(message.author.id, {
                timestamp: Date.now(),
                type: 'free',
                service: account.service,
                accountId: account.id,
                serviceName: serviceConfig.name,
                vouchChannel: VOUCH_CHANNEL_ID,
                vouchMessage: `+legit got account from ${client.user.username}`,
                expiresAt: Date.now() + VOUCH_TIMEOUT
            });

            // Enhanced timeout handler
            setTimeout(async () => {
                if (client.pendingVouches.has(message.author.id)) {
                    const vouchData = client.pendingVouches.get(message.author.id);
                    client.userCooldowns.set(message.author.id, Date.now() + COOLDOWN_TIME);
                    client.pendingVouches.delete(message.author.id);
                    
                    try {
                        const timeoutEmbed = new EmbedBuilder()
                            .setColor(0xFFAA00)
                            .setTitle('⏰ Vouch Time Expired')
                            .setDescription('You did not complete the vouch requirement within the time limit!')
                            .addFields(
                                {
                                    name: '🔒 Cooldown Activated',
                                    value: 'You cannot use free commands for **1 hour**',
                                    inline: true
                                },
                                {
                                    name: '📅 Cooldown Ends',
                                    value: `<t:${Math.floor((Date.now() + COOLDOWN_TIME) / 1000)}:R>`,
                                    inline: true
                                },
                                {
                                    name: '💡 Next Time',
                                    value: 'Remember to vouch within 10 minutes to avoid cooldowns',
                                    inline: false
                                }
                            )
                            .setFooter({ 
                                text: 'Vouch Requirement Not Met • Cooldown Active', 
                                iconURL: message.client.user.displayAvatarURL() 
                            })
                            .setTimestamp();

                        await message.author.send({
                            embeds: [timeoutEmbed]
                        });
                    } catch (error) {
                        console.log('Could not send cooldown notification to user');
                    }
                }
            }, VOUCH_TIMEOUT);

        } catch (error) {
            console.error('Error in free command:', error);
            
            // Enhanced error embed
            const errorEmbed = new EmbedBuilder()
                .setColor(0xFF4444)
                .setTitle('💥 System Error')
                .setDescription('An unexpected error occurred while processing your free account request!')
                .addFields(
                    {
                        name: '🔧 What Happened?',
                        value: 'Our system encountered a technical issue while generating your account',
                        inline: false
                    },
                    {
                        name: '🛠️ Solution',
                        value: 'Please try again in a few moments\nIf error persists, contact staff',
                        inline: false
                    },
                    {
                        name: '📞 Support',
                        value: 'Server staff have been notified of this issue',
                        inline: false
                    }
                )
                .setThumbnail('https://i.imgur.com/3v2Q5aA.png')
                .setFooter({ 
                    text: 'System Error • Free Accounts', 
                    iconURL: message.client.user.displayAvatarURL() 
                })
                .setTimestamp();

            await message.reply({
                embeds: [errorEmbed],
                ephemeral: true
            });
        }
    }
};