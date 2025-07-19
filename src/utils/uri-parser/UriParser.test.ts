import { expect } from 'chai';
import { UriParser, UriCommand, type ParseResult } from './UriParser';
import * as sinon from 'sinon';

describe('UriParser', () => {
  let consoleWarnStub: sinon.SinonStub;
  let consoleErrorStub: sinon.SinonStub;

  beforeEach(() => {
    consoleWarnStub = sinon.stub(console, 'warn');
    consoleErrorStub = sinon.stub(console, 'error');
  });

  afterEach(() => {
    consoleWarnStub.restore();
    consoleErrorStub.restore();
  });

  describe('parse', () => {
    it('should correctly parse a valid sync URI string', () => {
      const uriString =
        'vscode://AndrzejSulkowski.gitorial/sync?platform=github&creator=andrzejSulkowski&repo=gitorial&commitHash=abc123';
      const result = UriParser.parse(uriString);

      const expected: ParseResult = {
        command: UriCommand.Sync,
        payload: {
          commitHash: 'abc123',
          repoUrl: 'https://github.com/andrzejSulkowski/gitorial',
        },
      };
      expect(result).to.deep.equal(expected);
    });

    it('should correctly parse a valid sync URI string with gitlab', () => {
      const uriString =
        'vscode://AndrzejSulkowski.gitorial/sync?platform=gitlab&creator=andrzejSulkowski&repo=gitorial&commitHash=abc123';
      const result = UriParser.parse(uriString);

      const expected: ParseResult = {
        command: UriCommand.Sync,
        payload: {
          commitHash: 'abc123',
          repoUrl: 'https://gitlab.com/andrzejSulkowski/gitorial',
        },
      };
      expect(result).to.deep.equal(expected);
    });

    it('should correctly parse a valid sync URI string without authority', () => {
      const uriString = 'vscode:sync?creator=team&repo=project&commitHash=xyz789&platform=github';
      const result = UriParser.parse(uriString);
      const expected: ParseResult = {
        command: UriCommand.Sync,
        payload: {
          commitHash: 'xyz789',
          repoUrl: 'https://github.com/team/project',
        },
      };
      expect(result).to.deep.equal(expected);
    });

    it('should correctly parse a valid sync URI string with cursor', () => {
      const uriString =
        'cursor://AndrzejSulkowski.gitorial/sync?platform=github&creator=shawntabrizi&repo=rust-state-machine&commitHash=b74e58d9b3165a2e18f11f0fead411a754386c75';
      const result = UriParser.parse(uriString);
      const expected: ParseResult = {
        command: UriCommand.Sync,
        payload: {
          commitHash: 'b74e58d9b3165a2e18f11f0fead411a754386c75',
          repoUrl: 'https://github.com/shawntabrizi/rust-state-machine',
        },
      };
      expect(result).to.deep.equal(expected);
    });

    it('should return null if the URL constructor throws an error (e.g. malformed URI string)', () => {
      const malformedUriString = 'this is not a valid uri at all';
      const result = UriParser.parse(malformedUriString);
      expect(result).to.be.instanceOf(Error);
      expect(
        consoleErrorStub.calledOnceWith(
          sinon.match(/Error parsing URI:.*/),
          sinon.match.instanceOf(Error),
        ),
      ).to.be.true;
    });

    it('should return null if the platform is not supported', () => {
      const uriString =
        'vscode://AndrzejSulkowski.gitorial/sync?platform=gitempty&creator=andrzejSulkowski&repo=gitorial&commitHash=abc123';
      const result = UriParser.parse(uriString);
      expect(result).to.be.instanceOf(Error);
    });
  });
});
