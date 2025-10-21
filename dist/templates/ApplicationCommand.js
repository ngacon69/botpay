/**
 * Represents an Application Command
 */
export default class ApplicationCommand {
    data;
    hasSubCommands;
    execute;
    autocomplete;
    /**
     * @param {{
     *      data: SlashCommandBuilder | ContextMenuCommandBuilder | SlashCommandSubcommandsOnlyBuilder
     *      hasSubCommands?: boolean
     *      execute?: (interaction: ChatInputCommandInteraction) => Promise<void> | void
     *      autocomplete?: (interaction: AutocompleteInteraction) => Promise<void> | void
     *  }} options - The options for the slash command
     */
    constructor(options) {
        if (options.hasSubCommands) {
            this.execute = async (interaction) => {
                const subCommandGroup = interaction.options.getSubcommandGroup();
                const commandName = interaction.options.getSubcommand();
                if (!commandName) {
                    await interaction.reply({
                        content: "I couldn't understand that command!",
                        ephemeral: true
                    });
                }
                else {
                    try {
                        const command = (await import(`../subCommands/${this.data.name}/${subCommandGroup ? `${subCommandGroup}/` : ''}${commandName}.js`)).default;
                        await command.execute(interaction);
                    }
                    catch (error) {
                        console.error(error);
                        await interaction.reply({
                            content: 'An error occured when attempting to execute that command!',
                            ephemeral: true
                        });
                    }
                }
            };
            this.autocomplete = async (interaction) => {
                const subCommandGroup = interaction.options.getSubcommandGroup();
                const subCommandName = interaction.options.getSubcommand();
                if (subCommandGroup || subCommandName) {
                    try {
                        const subCommand = (await import(`../subCommands/${this.data.name}/${subCommandGroup ? `${subCommandGroup}/` : ''}${subCommandName}.js`)).default;
                        if (subCommand.autocomplete) {
                            await subCommand.autocomplete(interaction);
                        }
                    }
                    catch (error) {
                        console.error(error);
                        await interaction.respond([
                            {
                                name: 'Failed to autocomplete',
                                value: 'error'
                            }
                        ]);
                    }
                }
            };
        }
        else if (options.execute) {
            this.execute = options.execute;
        }
        else if (options.autocomplete) {
            this.autocomplete = options.autocomplete;
        }
        else {
            throw new Error('No execute function provided');
        }
        this.data = options.data;
        if (!options.hasSubCommands) {
            this.autocomplete = options.autocomplete;
        }
        this.hasSubCommands = options.hasSubCommands ?? false;
    }
}
