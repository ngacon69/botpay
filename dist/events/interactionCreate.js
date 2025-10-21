const { Events } = require('discord.js');

module.exports = {
    name: Events.InteractionCreate,
    async execute(interaction) {
        if (interaction.isChatInputCommand()) {
            const command = interaction.client.commands.get(interaction.commandName);

            if (!command) {
                console.error(`No command matching ${interaction.commandName} was found.`);
                return;
            }

            try {
                await command.execute(interaction);
            } catch (error) {
                console.error(error);
                await interaction.reply({
                    content: 'There was an error while executing this command!',
                    ephemeral: true
                });
            }
        } else if (interaction.isButton()) {
            // Handle panelpayout buttons
            if (interaction.customId === 'selectService' || 
                interaction.customId.startsWith('confirm_') || 
                interaction.customId.startsWith('cancel_')) {
                
                const panelPayout = interaction.client.commands.get('panelpayout');
                if (!panelPayout) return;

                try {
                    if (interaction.customId === 'selectService') {
                        await panelPayout.handleButton(interaction);
                    } else if (interaction.customId.startsWith('confirm_')) {
                        await panelPayout.handleConfirmButton(interaction);
                    } else if (interaction.customId.startsWith('cancel_')) {
                        await panelPayout.handleCancelButton(interaction);
                    }
                } catch (error) {
                    console.error('Error handling button interaction:', error);
                    await interaction.reply({
                        content: 'There was an error processing your request!',
                        ephemeral: true
                    });
                }
            }
        } else if (interaction.isStringSelectMenu()) {
            // Handle panelpayout select menu
            if (interaction.customId === 'serviceSelect') {
                const panelPayout = interaction.client.commands.get('panelpayout');
                if (!panelPayout) return;

                try {
                    await panelPayout.handleSelectMenu(interaction);
                } catch (error) {
                    console.error('Error handling select menu interaction:', error);
                    await interaction.reply({
                        content: 'There was an error processing your selection!',
                        ephemeral: true
                    });
                }
            }
        } else if (interaction.isModalSubmit()) {
            // Handle panelpayout modals
            if (interaction.customId.startsWith('accountModal_') || interaction.customId === 'colorModal') {
                const panelPayout = interaction.client.commands.get('panelpayout');
                if (!panelPayout) return;

                try {
                    await panelPayout.handleModalSubmit(interaction);
                } catch (error) {
                    console.error('Error handling modal interaction:', error);
                    await interaction.reply({
                        content: 'There was an error processing your submission!',
                        ephemeral: true
                    });
                }
            }
        }
    }
};
