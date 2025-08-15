import * as assert from 'assert';
import { Tutorial } from '../domain/models/Tutorial';
import { Step } from '../domain/models/Step';
import { TutorialId } from '@gitorial/shared-types';

suite('Tutorial Navigation', () => {
  let tutorial: Tutorial;
  let steps: Step[];

  setup(() => {
    // Create test steps with different types
    steps = [
      new Step({
        id: 'test-step-1',
        title: 'Step 1 - Section',
        commitHash: 'hash1',
        type: 'section',
        index: 0,
      }),
      new Step({
        id: 'test-step-2',
        title: 'Step 2 - Template',
        commitHash: 'hash2',
        type: 'template',
        index: 1,
      }),
      new Step({
        id: 'test-step-3',
        title: 'Step 3 - Solution',
        commitHash: 'hash3',
        type: 'solution',
        index: 2,
      }),
      new Step({
        id: 'test-step-4',
        title: 'Step 4 - Action',
        commitHash: 'hash4',
        type: 'action',
        index: 3,
      }),
    ];

    const tutorialData = {
      id: 'test-tutorial' as TutorialId,
      title: 'Test Tutorial',
      steps,
      activeStepIndex: 0,
      localPath: '/test/path',
    };

    tutorial = new Tutorial(tutorialData);
  });

  suite('next() method', () => {
    test('should navigate to the next step, skipping solution steps when coming from template', () => {
      // Start at step 0 (section)
      assert.strictEqual(tutorial.activeStepIndex, 0);
      assert.strictEqual(tutorial.activeStep.type, 'section');

      // Navigate to next step - should go to step 1 (template)
      const success = tutorial.next();
      assert.strictEqual(success, true);
      assert.strictEqual(tutorial.activeStepIndex, 1);
      assert.strictEqual(tutorial.activeStep.title, 'Step 2 - Template');

      // Navigate to next step from template - should skip solution and go to step 3 (action)
      const success2 = tutorial.next();
      assert.strictEqual(success2, true);
      assert.strictEqual(tutorial.activeStepIndex, 3);
      assert.strictEqual(tutorial.activeStep.title, 'Step 4 - Action');
    });

    test('should navigate normally when not coming from template step', () => {
      // Start at step 0 (section)
      assert.strictEqual(tutorial.activeStepIndex, 0);
      assert.strictEqual(tutorial.activeStep.type, 'section');

      // Navigate to next step - should go to step 1 (template)
      const success = tutorial.next();
      assert.strictEqual(success, true);
      assert.strictEqual(tutorial.activeStepIndex, 1);
      assert.strictEqual(tutorial.activeStep.type, 'template');
    });

    test('should return false when trying to go beyond the last step', () => {
      // Go to the last step
      tutorial.goTo(3);
      assert.strictEqual(tutorial.activeStepIndex, 3);

      // Try to go to next step
      const success = tutorial.next();
      assert.strictEqual(success, false);
      assert.strictEqual(tutorial.activeStepIndex, 3); // Should remain unchanged
    });
  });

  suite('prev() method', () => {
    test('should navigate to the previous step, skipping solution steps', () => {
      // Start at step 3 (action)
      tutorial.goTo(3);
      assert.strictEqual(tutorial.activeStepIndex, 3);
      assert.strictEqual(tutorial.activeStep.title, 'Step 4 - Action');

      // Navigate to previous step - should skip solution and go to step 1 (template)
      const success = tutorial.prev();
      assert.strictEqual(success, true);
      assert.strictEqual(tutorial.activeStepIndex, 1);
      assert.strictEqual(tutorial.activeStep.title, 'Step 2 - Template');

      // Navigate to previous step again - should go to step 0 (section)
      const success2 = tutorial.prev();
      assert.strictEqual(success2, true);
      assert.strictEqual(tutorial.activeStepIndex, 0);
      assert.strictEqual(tutorial.activeStep.title, 'Step 1 - Section');
    });

    test('should return false when trying to go before the first step', () => {
      // Start at step 0
      assert.strictEqual(tutorial.activeStepIndex, 0);

      // Try to go to previous step
      const success = tutorial.prev();
      assert.strictEqual(success, false);
      assert.strictEqual(tutorial.activeStepIndex, 0); // Should remain unchanged
    });
  });

  suite('goTo() method', () => {
    test('should navigate to a specific step index', () => {
      // Go to step 2
      const success = tutorial.goTo(2);
      assert.strictEqual(success, true);
      assert.strictEqual(tutorial.activeStepIndex, 2);
      assert.strictEqual(tutorial.activeStep.title, 'Step 3 - Solution');
    });

    test('should return false for invalid step indices', () => {
      // Try to go to negative index
      const success1 = tutorial.goTo(-1);
      assert.strictEqual(success1, false);
      assert.strictEqual(tutorial.activeStepIndex, 0); // Should remain unchanged

      // Try to go to index beyond array bounds
      const success2 = tutorial.goTo(10);
      assert.strictEqual(success2, false);
      assert.strictEqual(tutorial.activeStepIndex, 0); // Should remain unchanged
    });

    test('should reset solution state when navigating', () => {
      // Set solution state to true
      tutorial.isShowingSolution = true;
      assert.strictEqual(tutorial.isShowingSolution, true);

      // Navigate to a different step
      const success = tutorial.goTo(2);
      assert.strictEqual(success, true);
      assert.strictEqual(tutorial.isShowingSolution, false); // Should be reset
    });
  });

  suite('activeStep property', () => {
    test('should return the correct step based on activeStepIndex', () => {
      assert.strictEqual(tutorial.activeStep.title, 'Step 1 - Section');

      tutorial.goTo(1);
      assert.strictEqual(tutorial.activeStep.title, 'Step 2 - Template');

      tutorial.goTo(2);
      assert.strictEqual(tutorial.activeStep.title, 'Step 3 - Solution');
    });
  });
});
