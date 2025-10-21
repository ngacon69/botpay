const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, StringSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ChannelType, PermissionFlagsBits } = require('discord.js');

const userRequests = new Map();
const payoutHistory = [];
const activePanels = new Map();
const userVouchTimers = new Map();

module.exports = {
    data: new SlashCommandBuilder()
        .setName('panelpayout')
        .setDescription('🎁 Create an invite rewards payout panel')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addChannelOption(option =>
            option.setName('channel')
                .setDescription('Select channel to send the panel')
                .setRequired(false)
                .addChannelTypes(ChannelType.GuildText)),
    
    async execute(interaction) {
        if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
            return interaction.reply({
                content: '❌ You need administrator permissions to use this command.',
                ephemeral: true
            });
        }

        const targetChannel = interaction.options.getChannel('channel') || interaction.channel;

        const existingPanel = Array.from(activePanels.values()).find(panel => 
            panel.channelId === targetChannel.id
        );
        
        if (existingPanel) {
            return interaction.reply({
                content: `❌ There is already an active payout panel in ${targetChannel}.`,
                ephemeral: true
            });
        }

        // Premium color selection modal
        const colorModal = new ModalBuilder()
            .setCustomId(`color_modal_${targetChannel.id}`)
            .setTitle('🎨 Panel Customization')
            .setComponents(
                new ActionRowBuilder().addComponents(
                    new TextInputBuilder()
                        .setCustomId('color_input')
                        .setLabel('Embed Color (Hex Code)')
                        .setPlaceholder('#5865F2')
                        .setValue('#5865F2')
                        .setStyle(TextInputStyle.Short)
                        .setRequired(true)
                        .setMaxLength(7)
                )
            );

        await interaction.showModal(colorModal);

        const filter = (modalInteraction) => modalInteraction.customId === `color_modal_${targetChannel.id}`;
        
        try {
            const modalResponse = await interaction.awaitModalSubmit({
                filter,
                time: 60000
            });

            const embedColor = modalResponse.fields.getTextInputValue('color_input');
            
            const hexColorRegex = /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/;
            if (!hexColorRegex.test(embedColor)) {
                return modalResponse.reply({
                    content: '❌ Invalid color format! Please use hex format (e.g., #FF0000)',
                    ephemeral: true
                });
            }

            // ULTRA PREMIUM EMBED DESIGN
            const payoutEmbed = new EmbedBuilder()
                .setColor(embedColor)
                .setTitle('✨ **INVITE REWARDS SYSTEM** ✨')
                .setDescription([
                    '🎉 **Welcome to our Exclusive Rewards Program!** 🎉',
                    '',
                    '**Invite friends and claim amazing rewards!** 💫',
                    'All rewards are delivered directly to your DMs instantly! 🚀',
                    '',
                    '**⚠️ IMPORTANT:** You have **48 HOURS** to vouch after receiving your reward!',
                    'Failure to vouch will result in **PERMANENT BAN** from future events! 🔨'
                ].join('\n'))
                .addFields(
                    {
                        name: '🟩 **MINECRAFT REWARDS** 🟩',
                        value: [
                            '```diff',
                            '+ 🎯 2 INVITES → Minecraft Account',
                            '+ 🎯 5 INVITES → 3 Minecraft Accounts',
                            '```',
                            '*All accounts are Non-Full Access*'
                        ].join('\n'),
                        inline: false
                    },
                    {
                        name: '🟦 **XBOX REWARDS** 🟦',
                        value: [
                            '```diff',
                            '+ 🎮 5 INVITES → Xbox GamePass',
                            '+ 🎮 8 INVITES → Xbox Ultimate',
                            '```',
                            '*Premium gaming experience*'
                        ].join('\n'),
                        inline: false
                    },
                    {
                        name: '🟨 **METHOD REWARDS** 🟨',
                        value: [
                            '```diff',
                            '+ 💰 6 INVITES → Robux Method',
                            '+ 💳 10 INVITES → 1K Method',
                            '+ 💎 15 INVITES → 3K Method',
                            '```',
                            '*Proven working methods*'
                        ].join('\n'),
                        inline: false
                    }
                )
                .setImage('https://media.discordapp.net/attachments/123456789012345678/123456789012345678/banner_rewards.png?width=1200&height=300')
                .setThumbnail('https://media.discordapp.net/attachments/123456789012345678/123456789012345678/gift_icon.png')
                .setFooter({ 
                    text: '🎁 Premium Rewards System • One request per user • DMs must be open',
                    iconURL: 'https://media.discordapp.net/attachments/123456789012345678/123456789012345678/shield_icon.png'
                })
                .setTimestamp();

            // Premium button design
            const claimButton = new ButtonBuilder()
                .setCustomId('claim_reward')
                .setLabel('🎁 CLAIM YOUR REWARD')
                .setStyle(ButtonStyle.Success)
                .setEmoji('✨');

            const buttonRow = new ActionRowBuilder().addComponents(claimButton);

            await modalResponse.reply({
                content: `✅ **Premium payout panel created successfully in ${targetChannel}!**`,
                ephemeral: true
            });

            const panelMessage = await targetChannel.send({
                embeds: [payoutEmbed],
                components: [buttonRow]
            });

            activePanels.set(panelMessage.id, {
                messageId: panelMessage.id,
                channelId: targetChannel.id,
                guildId: interaction.guild.id,
                createdAt: Date.now(),
                color: embedColor
            });

            await this.logPayoutAction(
                interaction.client,
                'PANEL_CREATED',
                `Premium payout panel created in ${targetChannel} by ${interaction.user.tag}`,
                interaction.user
            );

        } catch (error) {
            if (error.name === 'Error [InteractionCollectorError]') {
                await interaction.followUp({
                    content: '⏰ Timeout! Please run the command again.',
                    ephemeral: true
                });
            } else {
                console.error('Error creating payout panel:', error);
                await interaction.followUp({
                    content: '❌ An error occurred while creating the payout panel.',
                    ephemeral: true
                });
            }
        }
    },

    async handleButton(interaction) {
        if (interaction.customId === 'claim_reward') {
            const panel = activePanels.get(interaction.message.id);
            if (!panel) {
                return interaction.reply({
                    content: '❌ **This rewards panel has expired!** Please contact staff for assistance.',
                    ephemeral: true
                });
            }

            // Check if user is banned from events
            const userBanned = this.isUserBanned(interaction.user.id);
            if (userBanned) {
                return interaction.reply({
                    content: '🚫 **You are banned from participating in events!**\nReason: Failed to vouch within 48 hours of receiving reward.',
                    ephemeral: true
                });
            }

            const existingRequest = userRequests.get(interaction.user.id);
            if (existingRequest) {
                const timeSinceRequest = Date.now() - existingRequest.timestamp;
                const cooldownTime = 30 * 60 * 1000;
                
                if (timeSinceRequest < cooldownTime && existingRequest.status !== 'COMPLETED') {
                    const remainingTime = Math.ceil((cooldownTime - timeSinceRequest) / 60000);
                    return interaction.reply({
                        content: `⏳ **Please wait ${remainingTime} minutes!**\nYou already have an active reward request in progress.`,
                        ephemeral: true
                    });
                }
            }

            // Premium selection menu
            const selectMenu = new StringSelectMenuBuilder()
                .setCustomId('service_select')
                .setPlaceholder('🎯 SELECT YOUR REWARD CATEGORY')
                .addOptions([
                    {
                        label: '🟩 Minecraft Account (2 Invites)',
                        description: 'Premium Minecraft Account - Non Full Access',
                        value: 'minecraft_2',
                        emoji: '🟩'
                    },
                    {
                        label: '🟩 3 Minecraft Accounts (5 Invites)',
                        description: 'Triple Minecraft Accounts Bundle',
                        value: 'minecraft_5',
                        emoji: '💎'
                    },
                    {
                        label: '🟦 Xbox GamePass (5 Invites)',
                        description: 'Xbox GamePass Subscription Account',
                        value: 'xbox_gamepass',
                        emoji: '🎮'
                    },
                    {
                        label: '🟦 Xbox Ultimate (8 Invites)',
                        description: 'Xbox Ultimate Premium Account',
                        value: 'xbox_ultimate',
                        emoji: '⭐'
                    },
                    {
                        label: '🟨 Robux Method (6 Invites)',
                        description: 'Advanced Robux Generation Method',
                        value: 'robux_method',
                        emoji: '💰'
                    },
                    {
                        label: '🟨 1K Method (10 Invites)',
                        description: 'Proven 1K Money Making Method',
                        value: '1k_method',
                        emoji: '💳'
                    },
                    {
                        label: '🟨 3K Method (15 Invites)',
                        description: 'Premium 3K Advanced Method',
                        value: '3k_method',
                        emoji: '💎'
                    }
                ]);

            const selectRow = new ActionRowBuilder().addComponents(selectMenu);

            userRequests.set(interaction.user.id, {
                service: null,
                status: 'SELECTING',
                timestamp: Date.now(),
                messageId: interaction.message.id
            });

            // Premium selection embed
            const selectionEmbed = new EmbedBuilder()
                .setColor('#FFD700')
                .setTitle('🎯 **SELECT YOUR REWARD**')
                .setDescription('Choose your desired reward from the menu below! 🌟')
                .addFields(
                    {
                        name: '📋 Instructions',
                        value: '1. Select your reward category\n2. Follow the instructions\n3. Receive reward in DMs\n4. **VOUCH WITHIN 48 HOURS!**',
                        inline: false
                    },
                    {
                        name: '⚠️ Important Notice',
                        value: 'Failure to vouch within 48 hours will result in **PERMANENT BAN** from all future events!',
                        inline: false
                    }
                )
                .setThumbnail('https://media.discordapp.net/attachments/123456789012345678/123456789012345678/select_icon.png')
                .setFooter({ text: 'Choose wisely! Each selection is final.' })
                .setTimestamp();

            await interaction.reply({
                embeds: [selectionEmbed],
                components: [selectRow],
                ephemeral: true
            });
        }
    },

    async handleSelectMenu(interaction) {
        if (interaction.customId === 'service_select') {
            const selectedService = interaction.values[0];
            
            userRequests.set(interaction.user.id, {
                service: selectedService,
                status: 'SUBMITTED',
                timestamp: Date.now(),
                messageId: interaction.message.id
            });

            const serviceNames = {
                'minecraft_2': '🟩 Minecraft Account (2 Invites)',
                'minecraft_5': '💎 3 Minecraft Accounts (5 Invites)',
                'xbox_gamepass': '🎮 Xbox GamePass (5 Invites)',
                'xbox_ultimate': '⭐ Xbox Ultimate (8 Invites)',
                'robux_method': '💰 Robux Method (6 Invites)',
                '1k_method': '💳 1K Method (10 Invites)',
                '3k_method': '💎 3K Method (15 Invites)'
            };

            const inviteRequirements = {
                'minecraft_2': 2,
                'minecraft_5': 5,
                'xbox_gamepass': 5,
                'xbox_ultimate': 8,
                'robux_method': 6,
                '1k_method': 10,
                '3k_method': 15
            };

            const requiredInvites = inviteRequirements[selectedService];

            // Premium method service handler
            if (['1k_method', '3k_method', 'robux_method'].includes(selectedService)) {
                const ticketChannelId = '1429770480323133471';
                
                const methodEmbed = new EmbedBuilder()
                    .setColor('#FFA500')
                    .setTitle('🎫 **PREMIUM TICKET REQUIRED**')
                    .setDescription(`**Selected Reward:** ${serviceNames[selectedService]}\n**Required Invites:** ${requiredInvites} invites`)
                    .addFields(
                        {
                            name: '🚀 Next Steps',
                            value: [
                                '```bash',
                                '#1 Go to ticket-create channel',
                                '#2 Click "Create Ticket" button',
                                '#3 Request your selected method',
                                '#4 Staff will verify & assist you',
                                '```'
                            ].join('\n'),
                            inline: false
                        },
                        {
                            name: '📌 Important',
                            value: '**Method rewards require manual verification for security and quality assurance.** 🔒',
                            inline: false
                        }
                    )
                    .setImage('https://media.discordapp.net/attachments/123456789012345678/123456789012345678/ticket_banner.png')
                    .setFooter({ text: 'Premium Method Verification • Secure Process' })
                    .setTimestamp();

                await interaction.update({
                    embeds: [methodEmbed],
                    components: []
                });

                await this.logPayoutRequest(interaction.user, selectedService, 'TICKET_REQUIRED');
                return;
            }

            // Premium account service handler
            const payoutChannelId = '1429777854425464872';
            const payoutChannel = interaction.client.channels.cache.get(payoutChannelId);

            if (!payoutChannel) {
                userRequests.delete(interaction.user.id);
                return interaction.update({
                    content: '❌ **System Error!** Payout channel not found. Please contact administration.',
                    components: [],
                    ephemeral: true
                });
            }

            // Premium request embed
            const requestEmbed = new EmbedBuilder()
                .setColor('#00FF00')
                .setTitle('🎁 **NEW PREMIUM REWARD REQUEST**')
                .setDescription(`**User:** ${interaction.user} │ **Tag:** ${interaction.user.tag}`)
                .addFields(
                    {
                        name: '📦 Selected Reward',
                        value: `**${serviceNames[selectedService]}**`,
                        inline: true
                    },
                    {
                        name: '🎯 Required Invites',
                        value: `**${requiredInvites} Invites**`,
                        inline: true
                    },
                    {
                        name: '🆔 User ID',
                        value: `\`\`\`${interaction.user.id}\`\`\``,
                        inline: false
                    },
                    {
                        name: '📊 Status',
                        value: '🟡 **Pending Review**',
                        inline: true
                    },
                    {
                        name: '⏰ Request Time',
                        value: `<t:${Math.floor(Date.now() / 1000)}:R>`,
                        inline: true
                    }
                )
                .setThumbnail(interaction.user.displayAvatarURL({ dynamic: true, size: 512 }))
                .setImage('https://media.discordapp.net/attachments/123456789012345678/123456789012345678/request_banner.png')
                .setFooter({ 
                    text: `Request ID: ${interaction.user.id.slice(-6)}-${Date.now().toString().slice(-6)} • Premium Rewards System`,
                    iconURL: 'https://media.discordapp.net/attachments/123456789012345678/123456789012345678/badge_icon.png'
                })
                .setTimestamp();

            // Premium action buttons
            const approveButton = new ButtonBuilder()
                .setCustomId(`approve_${interaction.user.id}_${selectedService}`)
                .setLabel('✅ APPROVE & SEND')
                .setStyle(ButtonStyle.Success)
                .setEmoji('🚀');

            const denyButton = new ButtonBuilder()
                .setCustomId(`deny_${interaction.user.id}_${selectedService}`)
                .setLabel('❌ DENY REQUEST')
                .setStyle(ButtonStyle.Danger)
                .setEmoji('⛔');

            const actionRow = new ActionRowBuilder().addComponents(approveButton, denyButton);

            try {
                await payoutChannel.send({
                    content: `📬 **NEW REWARD REQUEST** ${interaction.user} │ **${requiredInvites} INVITES REQUIRED**`,
                    embeds: [requestEmbed],
                    components: [actionRow]
                });

                // Premium success message
                const successEmbed = new EmbedBuilder()
                    .setColor('#00FF00')
                    .setTitle('✅ **REQUEST SUBMITTED SUCCESSFULLY!**')
                    .setDescription(`**Reward:** ${serviceNames[selectedService]}\n**Status:** Awaiting staff approval`)
                    .addFields(
                        {
                            name: '📋 What Happens Next?',
                            value: '• Staff will review your request\n• You\'ll receive reward via DM\n• **VOUCH WITHIN 48 HOURS!**',
                            inline: false
                        },
                        {
                            name: '⚠️ VOUCH REQUIREMENT',
                            value: '**Failure to vouch within 48 hours = PERMANENT EVENT BAN**',
                            inline: false
                        }
                    )
                    .setThumbnail('https://media.discordapp.net/attachments/123456789012345678/123456789012345678/success_icon.png')
                    .setFooter({ text: 'Keep your DMs open! We will contact you soon.' })
                    .setTimestamp();

                await interaction.update({
                    embeds: [successEmbed],
                    components: []
                });

                await this.logPayoutRequest(interaction.user, selectedService, 'SUBMITTED');

            } catch (error) {
                userRequests.delete(interaction.user.id);
                console.error('Error sending payout request:', error);
                
                const errorEmbed = new EmbedBuilder()
                    .setColor('#FF0000')
                    .setTitle('❌ **REQUEST FAILED**')
                    .setDescription('Failed to submit your reward request. Please try again later.')
                    .setFooter({ text: 'System Error • Please contact staff if this continues' });

                await interaction.update({
                    embeds: [errorEmbed],
                    components: []
                });
            }
        }
    },

    // ... (other methods remain the same but with premium styling)

    isUserBanned(userId) {
        const userData = userVouchTimers.get(userId);
        if (!userData) return false;
        
        return userData.banned === true;
    },

    async logPayoutAction(client, action, description, user = null) {
        const historyChannelId = '1429770521104486433';
        const historyChannel = client.channels.cache.get(historyChannelId);
        
        if (!historyChannel) {
            console.error('History channel not found!');
            return;
        }

        const logEmbed = new EmbedBuilder()
            .setColor(this.getActionColor(action))
            .setTitle(`📊 **${action.replace('_', ' ').toUpperCase()}**`)
            .setDescription(description)
            .setTimestamp()
            .setFooter({ text: 'Premium Rewards System Logger' });

        if (user) {
            logEmbed.setThumbnail(user.displayAvatarURL({ dynamic: true }));
            logEmbed.addFields({
                name: '👤 User',
                value: `${user.tag} (${user.id})`,
                inline: true
            });
        }

        try {
            await historyChannel.send({ embeds: [logEmbed] });
        } catch (error) {
            console.error('Error logging payout action:', error);
        }
    },

    getActionColor(action) {
        const colors = {
            'PANEL_CREATED': '#5865F2',
            'SUBMITTED': '#FEE75C',
            'COMPLETED': '#57F287',
            'TICKET_REQUIRED': '#FEE75C',
            'DENIED': '#ED4245'
        };
        return colors[action] || '#95A5A6';
    }
};
