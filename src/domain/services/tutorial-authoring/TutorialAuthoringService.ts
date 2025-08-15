
/*
How will tutorial authoring work?

The user will either be in author mode or not.
author mode boolean should be saved in global vs code settings.

if the user is in author mode, he will get access to the following features:

- create&edit a gitorial
- re-arrange steps
- add new steps
- delete steps
- add new content to steps
- delete content from steps
- add new content to steps
*/

import { Result, err } from 'neverthrow';
import { ITutorialRepository } from '@domain/repositories/ITutorialRepository';
import { Tutorial } from '@domain/models/Tutorial';

type AuthoringServiceError = 'Not implemented';

export class TutorialAuthoringService {
  constructor(
        private readonly tutorialRepository: ITutorialRepository,
  ){}

  public toggleAuthorMode(): void {}
  private _isAuthorMode(): boolean{
    return true;
  }

  /**
   /**
    * @param path - the absolute path to the git repo
    *
    */
  public createTutorial(_path: string, _commitMessage: string): Result<Tutorial, AuthoringServiceError> {
    //1) check if a git repo exists in the current workspace
    //2) if not, return an error
    //3) if yes, check if a 'gitorial' branch already exists
    //4) if yes, return an error
    //5) if no, create a new 'gitorial' branch
    //6) create a new tutorial
    //7) push the new tutorial to the 'gitorial' branch and commit it
    //8) return the new tutorial
    return err('Not implemented');
  }

  public reorderSteps(_commitHashes: string[]): Result<Tutorial, AuthoringServiceError> {
    return err('Not implemented');
  }

  public addStep(): Result<Tutorial, AuthoringServiceError> {
    return err('Not implemented');
  }
}
