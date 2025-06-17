import * as vscode from 'vscode';
import { Tutorial } from '../../domain/models/Tutorial';
import { IGitChanges } from '../ports/IGitChanges';
import { ITutorialInitializer } from '../ports/ITutorialInitializer';
import { IGitChangesFactory } from '../ports/IGitChangesFactory';
import { WebviewPanelManager } from '../panels/WebviewPanelManager';
import { TabTrackingService } from '../services/TabTrackingService';

/**
 * Initializes tutorial display components and sets up necessary state
 */
export class TutorialInitializer implements ITutorialInitializer {
  
  constructor(
    private readonly gitAdapterFactory: IGitChangesFactory,
    private readonly extensionUri: vscode.Uri,
    private readonly tabTrackingService: TabTrackingService
  ) {}

  /**
   * Initializes the tutorial view with necessary setup
   */
  initialize(tutorial: Readonly<Tutorial>): IGitChanges {
    WebviewPanelManager.renderSystem(this.extensionUri);
    
    const gitAdapter = this.gitAdapterFactory.createFromPath(tutorial.localPath);
    this.tabTrackingService.setTutorialPath(tutorial.localPath);
    
    return gitAdapter;
  }
} 