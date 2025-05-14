const SUPPORTED_PLATFORMS = ['github', 'gitlab'] as const;


// Commands that can be handled by the URI parser
enum UriCommand {
    Sync = "Sync"
}

type SyncPayload = {
    commitHash: string;
    repoUrl: string;
};

type CommandPayloads = {
    [UriCommand.Sync]: SyncPayload;
};

type ParseResult = {
    [K in UriCommand]: {
        command: K;
        payload: CommandPayloads[K];
    }
}[UriCommand] | null;


class UriParser {
    /**
     * Parses a vscode.Uri object and returns a structured ParseResult object if the URI is valid and recognized.
     * The parsing is designed to be extensible for new commands.
     *
     * @example
     * // Assuming uri is a string like 'vscode://AndrzejSulkowski.gitorial/sync?platform=github&creator=andrzejSulkowski&repo=gitorial&commitHash=abc123'
     * // Returns: {
     * //   command: UriCommand.Sync,
     * //   payload: { commitHash: 'abc123', githubRepoUrl: 'https://github.com/andrzejSulkowski/gitorial' }
     * // }
     *
     * @param uri - The URI string to parse (e.g., "vscode://<extensionId>/<command>?<params>").
     * @returns A ParseResult object if successful, or null if the URI is invalid, unknown, or malformed.
     */
    static parse(uri: string): ParseResult {
        try {
            const url = new URL(uri);

            if (url.protocol !== 'vscode:') {
                console.warn(`Invalid URI protocol: ${url.protocol}. Expected 'vscode:'.`);
                return null;
            }

            // Extract the command name from the pathname (e.g., "/sync" -> "sync")
            // URI path commands are expected to be lowercase.
            const commandNameFromUri = url.pathname.startsWith('/')
                ? url.pathname.substring(1).toLowerCase()
                : url.pathname.toLowerCase();

            let matchedCommand: UriCommand | null = null;

            if (commandNameFromUri === 'sync') {
                matchedCommand = UriCommand.Sync;
            }

            if (!matchedCommand) {
                console.warn(`Unknown or unsupported URI command: ${commandNameFromUri} from URI: ${uri.toString()}`);
                return null;
            }

            switch (matchedCommand) {
                case UriCommand.Sync: {
                    const payload = this.parseSyncPayload(url.searchParams);
                    if (payload) {
                        return { command: UriCommand.Sync, payload };
                    }
                    console.warn(`Failed to parse payload for Sync command from URI: ${uri.toString()}`);
                    return null;
                }
                default:
                    console.warn(`Unhandled matched command: ${matchedCommand} from URI: ${uri.toString()}`);
                    return null;
            }
        } catch (error) {
            console.error(`Error parsing URI: ${uri.toString()}`, error);
            return null;
        }
    }

    /**
     * Parses the query parameters for a 'Sync' command.
     * Expects 'creator', 'repo', 'commitHash', and 'platform' parameters.
     *
     * @param searchParams - URLSearchParams object from the parsed URI.
     * @returns A SyncPayload object if all required parameters are present, otherwise null.
     */
    private static parseSyncPayload(searchParams: URLSearchParams): SyncPayload | null {
        const creator = searchParams.get('creator');
        const repo = searchParams.get('repo');
        const commitHash = searchParams.get('commitHash');
        const platform = searchParams.get('platform');

        if (!SUPPORTED_PLATFORMS.includes(platform as typeof SUPPORTED_PLATFORMS[number])) {
            console.warn(`Unsupported platform: ${platform} for Sync command in query: ${searchParams.toString()}`);
            return null;
        }

        if (creator && repo && commitHash) {
            return {
                commitHash,
                repoUrl: `https://${platform}.com/${creator}/${repo}`
            };
        }
        console.warn('Missing required parameters (creator, repo, commitHash) for Sync command in query:', searchParams.toString());
        return null;
    }
}

export { UriParser, UriCommand, SyncPayload, CommandPayloads, ParseResult };