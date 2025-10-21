import { BaseInteraction, Events } from 'discord.js'
import type ApplicationCommand from '../templates/ApplicationCommand.js'
import Event from '../templates/Event.js'

export default new Event({
    name: Events.InteractionCreate,
    async execute(interaction: BaseInteraction): Promise<void> {
        // If it's a slash command
        if (interaction.isChatInputCommand()) {
            if (!client.commands.has(interaction.commandName)) return

            try {
                const command: ApplicationCommand = client.commands.get(
                    interaction.commandName
                ) as ApplicationCommand

                if (!command.execute) {
                    console.error(`💀 No exec handler for ${command.data.name}`)
                    await interaction.reply({
                        content: "Bruh, something went 💥 executing this command!",
                        ephemeral: true
                    })
                    return
                }

                // execute the command
                await command.execute(interaction)
            } catch (err) {
                console.error(err)
                await interaction.reply({
                    content: "Oopsie 😵‍💫 something broke while running this command!",
                    ephemeral: true
                })
            }

        // If it's autocomplete
        } else if (interaction.isAutocomplete()) {
            if (!client.commands.has(interaction.commandName)) return

            try {
                const command: ApplicationCommand = client.commands.get(
                    interaction.commandName
                ) as ApplicationCommand

                if (!command.autocomplete) {
                    console.error(`🤔 No autocomplete handler for ${command.data.name}`)
                    await interaction.respond([
                        { name: 'oops failed autocomplete 😬', value: 'error' }
                    ])
                    return
                }

                await command.autocomplete(interaction)
            } catch (err) {
                console.error('yeet, autocomplete fail', err)
            }
        }
    }
})
