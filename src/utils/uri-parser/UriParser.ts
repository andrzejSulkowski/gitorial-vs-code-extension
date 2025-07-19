const SUPPORTED_PLATFORMS = ['github', 'gitlab'] as const;

// Commands that can be handled by the URI parser
enum UriCommand {
  Sync = 'Sync',
}

type SyncPayload = {
  commitHash: string;
  repoUrl: string;
};

type CommandPayloads = {
  [UriCommand.Sync]: SyncPayload;
};

type ParseResult =
  | {
      [K in UriCommand]: {
        command: K;
        payload: CommandPayloads[K];
      };
    }[UriCommand]
  | Error;

class UriParser {
  //TODO: improve JS Docs
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
   * // or a more realistic example:
   * // vscode://AndrzejSulkowski.gitorial/sync?platform=github&creator=shawntabrizi&repo=rust-state-machine&commitHash=b74e58d9b3165a2e18f11f0fead411a754386c75
   *
   * @param uri - The URI string to parse (e.g., "vscode://<extensionId>/<command>?<params>").
   * @returns A ParseResult object if successful, or null if the URI is invalid, unknown, or malformed.
   */
  static parse(uri: string): ParseResult {
    try {
      const url = new URL(uri);

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
        return new Error(
          `Unknown or unsupported URI command: ${commandNameFromUri} from URI: ${uri.toString()}`,
        );
      }

      switch (matchedCommand) {
      case UriCommand.Sync: {
        const payload = this.parseSyncPayload(url.searchParams);
        if (!(payload instanceof Error)) {
          return { command: UriCommand.Sync, payload };
        }
        return new Error(
          `Failed to parse payload for Sync command from URI: ${uri.toString()}\n${payload.message}`,
        );
      }
      default:
        console.warn(`Unhandled matched command: ${matchedCommand} from URI: ${uri.toString()}`);
        return new Error(
          `Unhandled matched command: ${matchedCommand} from URI: ${uri.toString()}`,
        );
      }
    } catch (error) {
      console.error(`Error parsing URI: ${uri.toString()}`, error);
      return new Error(`Error parsing URI: ${uri.toString()}`);
    }
  }

  /**
   * Parses the query parameters for a 'Sync' command.
   * Expects 'creator', 'repo', 'commitHash', and 'platform' parameters.
   *
   * @param searchParams - URLSearchParams object from the parsed URI.
   * @returns A SyncPayload object if all required parameters are present, otherwise null.
   */
  private static parseSyncPayload(searchParams: URLSearchParams): SyncPayload | Error {
    const creator = searchParams.get('creator');
    const repo = searchParams.get('repo');
    const commitHash = searchParams.get('commitHash');
    const platform = searchParams.get('platform');

    if (!SUPPORTED_PLATFORMS.includes(platform as (typeof SUPPORTED_PLATFORMS)[number])) {
      return new Error(
        `Unsupported platform: ${platform} for Sync command in query: ${searchParams.toString()}`,
      );
    }

    if (creator && repo && commitHash) {
      return {
        commitHash,
        repoUrl: `https://${platform}.com/${creator}/${repo}`,
      };
    }
    return new Error(
      `Missing required parameters (creator, repo, commitHash) for Sync command in query: ${searchParams.toString()}`,
    );
  }
}

export { UriParser, UriCommand, SyncPayload, CommandPayloads, ParseResult };
