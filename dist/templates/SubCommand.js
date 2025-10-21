/**
 * Represents a SubCommand
 */
export default class SubCommand {
    execute;
    autocomplete;
    /**
     *
     * @param {{
     *      execute: (interaction: ChatInputCommandInteraction) => Promise<void> | void
     *      autocomplete?: (interaction: AutocompleteInteraction) => Promise<void> | void
     *  }} options - The options for the subcommand
     */
    constructor(options) {
        this.execute = options.execute;
        if (options.autocomplete) {
            this.autocomplete = options.autocomplete;
        }
    }
    /**
     * Set the autocomplete function of the subcommand
     * @param {(interaction: AutocompleteInteraction) => Promise<void> | void} autocompleteFunction - The function
     */
    setAutocomplete(autocompleteFunction) {
        this.autocomplete = autocompleteFunction;
    }
    /**
     * Set the execute function of the subcommand
     * @param {(interaction: ChatInputCommandInteraction) => Promise<void> | void} executeFunction - The function
     */
    setExecute(executeFunction) {
        this.execute = executeFunction;
    }
}
