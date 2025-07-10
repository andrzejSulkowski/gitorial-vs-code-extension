import { TutorialViewModelConverter } from "@domain/converters/TutorialViewModelConverter";
import { DiffService } from "./DiffService";
import { Tutorial } from "@domain/models/Tutorial";
import { TutorialViewModel } from "@gitorial/shared-types";
import { IGitChanges } from "@ui/ports/IGitChanges";
import { TutorialChangeDetector, TutorialViewChangeType } from '@domain/utils/TutorialChangeDetector';

export type TutorialDisplayResult = {
    viewModel: TutorialViewModel;
    filesToDisplay: string[];
}

/**
 * Domain service responsible for preparing tutorial data for display.
 * Handles business logic for tutorial rendering without UI concerns.
 * 
 * Note: Currently depends on IGitChanges from UI layer - this is a temporary
 * architectural compromise that should be resolved by moving IGitChanges to domain layer.
 */
export class TutorialDisplayService {
    private readonly changeDetector: TutorialChangeDetector;

    constructor(
        private readonly viewModelConverter: TutorialViewModelConverter,
        private readonly diffService: DiffService
    ) {
        this.changeDetector = new TutorialChangeDetector();
    }

    public async prepareTutorialDisplay(tutorial: Readonly<Tutorial>, gitChanges: IGitChanges): Promise<TutorialDisplayResult> {
        const viewModel = this.viewModelConverter.convert(tutorial);

        const diffs = await this.diffService.getDiffModelsForParent(tutorial, gitChanges);
        
        return {
            viewModel,
            filesToDisplay: diffs.map(d => d.relativePath),
        };
    }

    public async detectDisplayChanges(current: TutorialViewModel, previous: TutorialViewModel): Promise<TutorialViewChangeType> {
        return this.changeDetector.detectChange(current, previous);
    }
}