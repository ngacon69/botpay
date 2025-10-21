const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, StringSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ChannelType, PermissionFlagsBits } = require('discord.js');

const userRequests = new Map();
const payoutHistory = [];
const activePanels = new Map();

module.exports = {
    data: new SlashCommandBuilder()
        .setName('panelpayout')
        .setDescription('Create payout panel')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addChannelOption(option =>
            option.setName('channel')
                .setDescription('Channel to send panel')
                .setRequired(false)
                .addChannelTypes(ChannelType.GuildText)),
    
    async execute(interaction) {
        if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
            return interaction.reply({
                content: '❌ You need administrator permissions.',
                ephemeral: true
            });
        }

        const targetChannel = interaction.options.getChannel('channel') || interaction.channel;

        const existingPanel = Array.from(activePanels.values()).find(panel => 
            panel.channelId === targetChannel.id
        );
        
        if (existingPanel) {
            return interaction.reply({
                content: `❌ Active panel already exists in ${targetChannel}.`,
                ephemeral: true
            });
        }

        const colorModal = new ModalBuilder()
            .setCustomId(`color_modal_${targetChannel.id}`)
            .setTitle('Panel Color')
            .setComponents(
                new ActionRowBuilder().addComponents(
                    new TextInputBuilder()
                        .setCustomId('color_input')
                        .setLabel('Embed Color (Hex)')
                        .setPlaceholder('#5865F2')
                        .setValue('#5865F2')
                        .setStyle(TextInputStyle.Short)
                        .setRequired(true)
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
                    content: '❌ Invalid color format! Use hex format.',
                    ephemeral: true
                });
            }

            // Simple clean embed
            const payoutEmbed = new EmbedBuilder()
                .setColor(embedColor)
                .setTitle('🎁 Invite Rewards')
                .setDescription('Claim rewards based on your invites. All rewards sent via DM.')
                .addFields(
                    {
                        name: 'Minecraft',
                        value: '• 2 invites → Minecraft Account\n• 5 invites → 3 Minecraft Accounts',
                        inline: false
                    },
                    {
                        name: 'Xbox',
                        value: '• 5 invites → Xbox GamePass\n• 8 invites → Xbox Ultimate',
                        inline: false
                    },
                    {
                        name: 'Methods',
                        value: '• 6 invites → Robux Method\n• 10 invites → 1k Method\n• 15 invites → 3k Method',
                        inline: false
                    }
                )
                .setFooter({ text: 'One request per user • DMs must be open' });

            const claimButton = new ButtonBuilder()
                .setCustomId('claim_reward')
                .setLabel('Claim Reward')
                .setStyle(ButtonStyle.Primary)
                .setEmoji('🎁');

            const buttonRow = new ActionRowBuilder().addComponents(claimButton);

            await modalResponse.reply({
                content: `✅ Panel created in ${targetChannel}!`,
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

        } catch (error) {
            if (error.name === 'Error [InteractionCollectorError]') {
                await interaction.followUp({
                    content: '❌ Timeout! Try again.',
                    ephemeral: true
                });
            } else {
                console.error('Error:', error);
                await interaction.followUp({
                    content: '❌ Error creating panel.',
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
                    content: '❌ Panel not active.',
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
                        content: `❌ Wait ${remainingTime} minutes.`,
                        ephemeral: true
                    });
                }
            }

            const selectMenu = new StringSelectMenuBuilder()
                .setCustomId('service_select')
                .setPlaceholder('Select reward')
                .addOptions([
                    {
                        label: 'Minecraft Account (2)',
                        description: 'Minecraft Account',
                        value: 'minecraft_2'
                    },
                    {
                        label: '3 Minecraft Accounts (5)',
                        description: '3 Minecraft Accounts',
                        value: 'minecraft_5'
                    },
                    {
                        label: 'Xbox GamePass (5)',
                        description: 'Xbox GamePass',
                        value: 'xbox_gamepass'
                    },
                    {
                        label: 'Xbox Ultimate (8)',
                        description: 'Xbox Ultimate',
                        value: 'xbox_ultimate'
                    },
                    {
                        label: 'Robux Method (6)',
                        description: 'Robux Method - 6 invites',
                        value: 'robux_method'
                    },
                    {
                        label: '1k Method (10)',
                        description: '1k Method - 10 invites',
                        value: '1k_method'
                    },
                    {
                        label: '3k Method (15)',
                        description: '3k Method - 15 invites',
                        value: '3k_method'
                    }
                ]);

            const selectRow = new ActionRowBuilder().addComponents(selectMenu);

            userRequests.set(interaction.user.id, {
                service: null,
                status: 'SELECTING',
                timestamp: Date.now(),
                messageId: interaction.message.id
            });

            await interaction.reply({
                content: 'Select your reward:',
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
                'minecraft_2': 'Minecraft Account (2 invites)',
                'minecraft_5': '3 Minecraft Accounts (5 invites)',
                'xbox_gamepass': 'Xbox GamePass (5 invites)',
                'xbox_ultimate': 'Xbox Ultimate (8 invites)',
                'robux_method': 'Robux Method (6 invites)',
                '1k_method': '1k Method (10 invites)',
                '3k_method': '3k Method (15 invites)'
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

            // Method services go to ticket channel
            if (['1k_method', '3k_method', 'robux_method'].includes(selectedService)) {
                const ticketChannelId = '1429770480323133471';
                
                await interaction.update({
                    content: `To claim **${serviceNames[selectedService]}**, create ticket in <#${ticketChannelId}>`,
                    components: []
                });

                await this.logPayoutRequest(interaction.user, selectedService, 'TICKET_REQUIRED');
                return;
            }

            // Account services go to payout channel
            const payoutChannelId = '1429777854425464872';
            const payoutChannel = interaction.client.channels.cache.get(payoutChannelId);

            if (!payoutChannel) {
                userRequests.delete(interaction.user.id);
                return interaction.update({
                    content: '❌ Payout channel error.',
                    components: [],
                    ephemeral: true
                });
            }

            const requestEmbed = new EmbedBuilder()
                .setColor('#00FF00')
                .setTitle('Payout Request')
                .setDescription(`**User:** ${interaction.user.tag}\n**Service:** ${serviceNames[selectedService]}`)
                .addFields(
                    {
                        name: 'Status',
                        value: 'Pending',
                        inline: true
                    },
                    {
                        name: 'Invites Required',
                        value: `${requiredInvites}`,
                        inline: true
                    }
                )
                .setTimestamp();

            const approveButton = new ButtonBuilder()
                .setCustomId(`approve_${interaction.user.id}_${selectedService}`)
                .setLabel('Approve')
                .setStyle(ButtonStyle.Success);

            const actionRow = new ActionRowBuilder().addComponents(approveButton);

            try {
                await payoutChannel.send({
                    content: `New request from ${interaction.user}`,
                    embeds: [requestEmbed],
                    components: [actionRow]
                });

                await interaction.update({
                    content: `✅ Request submitted for **${serviceNames[selectedService]}**`,
                    components: []
                });

                await this.logPayoutRequest(interaction.user, selectedService, 'SUBMITTED');

            } catch (error) {
                userRequests.delete(interaction.user.id);
                await interaction.update({
                    content: '❌ Failed to submit request.',
                    components: [],
                    ephemeral: true
                });
            }
        }
    },

    async handleApprove(interaction) {
        if (interaction.customId.startsWith('approve_')) {
            const [, userId, service] = interaction.customId.split('_');
            const user = await interaction.client.users.fetch(userId);

            const serviceNames = {
                'minecraft_2': 'Minecraft Account (2 invites)',
                'minecraft_5': '3 Minecraft Accounts (5 invites)',
                'xbox_gamepass': 'Xbox GamePass (5 invites)',
                'xbox_ultimate': 'Xbox Ultimate (8 invites)',
                'robux_method': 'Robux Method (6 invites)'
            };

            if (service === 'robux_method') {
                const robuxEmbed = new EmbedBuilder()
                    .setColor('#FF0000')
                    .setTitle('Robux Method')
                    .setDescription('**Requirements:**\n- Apple/Android device\n- iTunes/Google Play money')
                    .addFields(
                        {
                            name: 'Steps:',
                            value: `1. Buy robux on your device
2. Spend them
3. Go to reportaproblem.apple.com
4. Sign in
5. Request refund
6. Use reason: "My child made this purchase by mistake"
7. Wait 6-48 hours for refund
8. Repeat carefully`,
                            inline: false
                        }
                    );

                try {
                    await user.send({
                        content: 'Your Robux Method:',
                        embeds: [robuxEmbed]
                    });

                    const updatedEmbed = EmbedBuilder.from(interaction.message.embeds[0])
                        .setColor('#00FF00')
                        .spliceFields(0, 1, {
                            name: 'Status',
                            value: 'Completed',
                            inline: true
                        });

                    await interaction.message.edit({
                        embeds: [updatedEmbed],
                        components: []
                    });

                    await interaction.reply({
                        content: `✅ Robux method sent to ${user.tag}`,
                        ephemeral: true
                    });

                    this.logPayoutRequest(user, service, 'COMPLETED');
                    userRequests.delete(userId);

                } catch (error) {
                    await interaction.reply({
                        content: `❌ Failed to send DM to ${user.tag}`,
                        ephemeral: true
                    });
                }
                return;
            }

            // For other services, request credentials
            const credentialsModal = new ModalBuilder()
                .setCustomId(`credentials_${userId}_${service}`)
                .setTitle('Enter Credentials');

            const emailInput = new TextInputBuilder()
                .setCustomId('email_input')
                .setLabel('Email:Password')
                .setPlaceholder('email:password')
                .setStyle(TextInputStyle.Short)
                .setRequired(true);

            const modalRow = new ActionRowBuilder().addComponents(emailInput);
            credentialsModal.addComponents(modalRow);

            await interaction.showModal(credentialsModal);
        }
    },

    async handleCredentialsModal(interaction) {
        if (interaction.customId.startsWith('credentials_')) {
            const [, userId, service] = interaction.customId.split('_');
            const user = await interaction.client.users.fetch(userId);
            const credentials = interaction.fields.getTextInputValue('email_input');

            if (!credentials.includes(':')) {
                return interaction.reply({
                    content: '❌ Use email:password format.',
                    ephemeral: true
                });
            }

            const serviceNames = {
                'minecraft_2': 'Minecraft Account (2 invites)',
                'minecraft_5': '3 Minecraft Accounts (5 invites)',
                'xbox_gamepass': 'Xbox GamePass (5 invites)',
                'xbox_ultimate': 'Xbox Ultimate (8 invites)'
            };

            try {
                await user.send({
                    content: `Your ${serviceNames[service]}:\n\`\`\`${credentials}\`\`\``
                });

                const updatedEmbed = EmbedBuilder.from(interaction.message.embeds[0])
                    .setColor('#00FF00')
                    .spliceFields(0, 1, {
                        name: 'Status',
                        value: 'Completed',
                        inline: true
                    });

                await interaction.message.edit({
                    embeds: [updatedEmbed],
                    components: []
                });

                await interaction.reply({
                    content: `✅ Credentials sent to ${user.tag}`,
                    ephemeral: true
                });

                this.logPayoutRequest(user, service, 'COMPLETED');
                userRequests.delete(userId);

            } catch (error) {
                await interaction.reply({
                    content: `❌ Failed to send DM to ${user.tag}`,
                    ephemeral: true
                });
            }
        }
    },

    async logPayoutRequest(user, service, status) {
        const historyChannelId = '1429770521104486433';
        const historyChannel = user.client.channels.cache.get(historyChannelId);
        
        if (!historyChannel) return;

        const logEmbed = new EmbedBuilder()
            .setColor(status === 'COMPLETED' ? '#00FF00' : '#FFA500')
            .setTitle('Payout Log')
            .setDescription(`**User:** ${user.tag}\n**Service:** ${service}\n**Status:** ${status}`)
            .setTimestamp();

        try {
            await historyChannel.send({ embeds: [logEmbed] });
        } catch (error) {
            console.error('Error logging:', error);
        }
    }
};
