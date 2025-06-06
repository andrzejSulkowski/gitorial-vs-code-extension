import { expect } from 'chai';
import { RelayClient, RelayClientConfig, RelayClientEventHandler, RelayClientEvent, TutorialSyncState, SyncPhase } from '../../src';
import { getTestServer } from './test-server';
import { asTutorialId } from '@gitorial/shared-types';

/**
 * Event handler that simulates VS Code behavior
 */
class VSCodeEventHandler implements RelayClientEventHandler {
    public events: RelayClientEvent[] = [];
    private client: RelayClient | null = null;

    constructor(private name: string = 'VSCode') { }

    setClient(client: RelayClient): void {
        this.client = client;
    }

    onEvent(event: RelayClientEvent): void {
        this.events.push(event);
        console.log(`[${this.name}] Event: ${event.type}`);

        // VS Code event-driven behavior
        switch (event.type) {
            case 'connected':
                console.log(`[${this.name}] Connected to session`);
                break;

            case 'clientConnected':
                console.log(`[${this.name}] Another client joined the session`);
                // When another client joins, VS Code waits for user decision
                // In this test, we simulate choosing to become active (receive state)
                this.handleSecondClientJoined();
                break;

            case 'phaseChanged':
                console.log(`[${this.name}] Phase changed to: ${event.phase}`);
                if (event.phase === SyncPhase.ACTIVE) {
                    console.log(`[${this.name}] Now active - can send tutorial states`);
                    this.handleBecameActive();
                }
                break;

            case 'tutorialStateReceived':
                console.log(`[${this.name}] Received tutorial state: ${event.state.stepContent.title}`);
                break;

            case 'controlOffered':
                console.log(`[${this.name}] Control offered by peer`);
                // Auto-accept control offers in this test
                event.event.accept();
                break;
        }
    }

    /**
     * Simulate VS Code deciding to become active when second client joins
     */
    private async handleSecondClientJoined(): Promise<void> {
        // Simulate user choosing to "pull from DotCodeSchool"
        setTimeout(async () => {
            if (this.client?.is.idle()) {
                console.log(`[${this.name}] User chose to receive state from DotCodeSchool`);
                await this.client.sync.asActive();
            }
        }, 100);
    }

    /**
     * Simulate VS Code behavior when becoming active
     */
    private async handleBecameActive(): Promise<void> {
        // When active, VS Code can send its current tutorial state
        setTimeout(() => {
            if (this.client?.is.active()) {
                const currentState: TutorialSyncState = {
                    tutorialId: asTutorialId('javascript-advanced'),
                    tutorialTitle: 'JavaScript Advanced Concepts',
                    totalSteps: 12,
                    isShowingSolution: false,
                    stepContent: {
                        id: 'step-7',
                        title: 'Async/Await Patterns',
                        commitHash: 'def456ghi',
                        type: 'template',
                        index: 6
                    },
                    repoUrl: 'https://github.com/vscode-user/js-advanced'
                };

                console.log(`[${this.name}] Sending current tutorial state`);
                this.client.tutorial.sendState(currentState);
            }
        }, 150);
    }

    getEvent(type: string): RelayClientEvent | undefined {
        return this.events.find(event => event.type === type);
    }

    getEvents(type: string): RelayClientEvent[] {
        return this.events.filter(event => event.type === type);
    }
}

/**
 * Event handler that simulates DotCodeSchool behavior
 */
class DotCodeSchoolEventHandler implements RelayClientEventHandler {
    public events: RelayClientEvent[] = [];
    private client: RelayClient | null = null;

    constructor(private name: string = 'DotCodeSchool') { }

    setClient(client: RelayClient): void {
        this.client = client;
    }

    onEvent(event: RelayClientEvent): void {
        this.events.push(event);
        console.log(`[${this.name}] Event: ${event.type}`);

        // DotCodeSchool event-driven behavior
        switch (event.type) {
            case 'connected':
                console.log(`[${this.name}] Connected and waiting for VS Code`);
                break;

            case 'clientConnected':
                console.log(`[${this.name}] VS Code joined the session!`);
                // DotCodeSchool waits for VS Code to decide sync direction
                break;

            case 'phaseChanged':
                console.log(`[${this.name}] Phase changed to: ${event.phase}`);
                if (event.phase === SyncPhase.PASSIVE) {
                    console.log(`[${this.name}] Now passive - will receive VS Code's state`);
                }
                break;

            case 'tutorialStateReceived':
                console.log(`[${this.name}] Received VS Code tutorial state: ${event.state.stepContent.title}`);
                // DotCodeSchool might sync its UI based on received state
                this.handleReceivedTutorialState(event.state);
                break;

            case 'controlRequested':
                console.log(`[${this.name}] VS Code requested control`);
                break;
        }
    }

    /**
     * Simulate DotCodeSchool processing received tutorial state
     */
    private handleReceivedTutorialState(state: TutorialSyncState): void {
        console.log(`[${this.name}] Updating UI to show: ${state.stepContent.title}`);
        console.log(`[${this.name}] Step ${state.stepContent.index + 1} of ${state.totalSteps}`);
    }

    getEvent(type: string): RelayClientEvent | undefined {
        return this.events.find(event => event.type === type);
    }

    getEvents(type: string): RelayClientEvent[] {
        return this.events.filter(event => event.type === type);
    }
}

describe('VS Code ↔ DotCodeSchool Communication Test', () => {
    let server: Awaited<ReturnType<typeof getTestServer>>;
    let port: number;

    before(async () => {
        server = await getTestServer();
        port = server.port;
        await server.start();
    });

    after(async () => await server.stop());


    it('should simulate complete VS Code and DotCodeSchool communication flow', async () => {
        console.log('\n🚀 Starting VS Code ↔ DotCodeSchool Communication Test\n');

        // Create event handlers
        const dotCodeSchoolHandler = new DotCodeSchoolEventHandler();
        const vsCodeHandler = new VSCodeEventHandler();

        // Create clients
        const dotCodeSchoolClient = new RelayClient({
            serverUrl: `ws://localhost:${port}`,
            sessionEndpoint: '/api/sessions',
            eventHandler: dotCodeSchoolHandler
        });

        const vsCodeClient = new RelayClient({
            serverUrl: `ws://localhost:${port}`,
            sessionEndpoint: '/api/sessions',
            eventHandler: vsCodeHandler
        });

        // Set client references for handlers
        dotCodeSchoolHandler.setClient(dotCodeSchoolClient);
        vsCodeHandler.setClient(vsCodeClient);

        try {
            console.log('📚 Phase 1: DotCodeSchool creates session and waits');

            // 1. DotCodeSchool creates session and connects
            const session = await dotCodeSchoolClient.session.create({
                tutorial: 'javascript-fundamentals'
            });

            // 2. DotCodeSchool connects to the session
            await dotCodeSchoolClient.connect(session.id);

            expect(session).to.be.an('object');
            expect(dotCodeSchoolClient.is.connected()).to.be.true;
            expect(dotCodeSchoolClient.getCurrentPhase()).to.equal(SyncPhase.CONNECTED_IDLE);

            // Verify DotCodeSchool connection event
            const dotCodeSchoolConnected = dotCodeSchoolHandler.getEvent('connected');
            expect(dotCodeSchoolConnected).to.not.be.undefined;

            console.log('\n💻 Phase 2: VS Code joins the session');

            // 2. VS Code connects to the session  
            await vsCodeClient.connect(session.id);

            expect(vsCodeClient.is.connected()).to.be.true;
            expect(vsCodeClient.getCurrentPhase()).to.equal(SyncPhase.CONNECTED_IDLE);

            // Wait for connection events to propagate
            await new Promise(resolve => setTimeout(resolve, 200));

            console.log('\n🤝 Phase 3: Clients detect each other');

            // Both clients should have received clientConnected events
            const dotCodeSchoolClientConnected = dotCodeSchoolHandler.getEvent('clientConnected');
            const vsCodeClientConnected = vsCodeHandler.getEvent('clientConnected');

            expect(dotCodeSchoolClientConnected).to.not.be.undefined;
            expect(vsCodeClientConnected).to.not.be.undefined;

            console.log('\n⚖️ Phase 4: Sync direction negotiation');

            // Wait for VS Code's automated decision to become active
            await new Promise(resolve => setTimeout(resolve, 400));

            // VS Code should now be active, DotCodeSchool passive
            expect(vsCodeClient.is.active()).to.be.true;
            expect(dotCodeSchoolClient.is.passive()).to.be.true;

            // Check phase changed events
            const vsCodePhaseChanged = vsCodeHandler.getEvents('phaseChanged');
            const dotCodeSchoolPhaseChanged = dotCodeSchoolHandler.getEvents('phaseChanged');

            expect(vsCodePhaseChanged.length).to.be.greaterThan(0);
            expect(dotCodeSchoolPhaseChanged.length).to.be.greaterThan(0);

            console.log('\n📤 Phase 5: VS Code sends tutorial state');

            // Wait for VS Code's automated tutorial state sending
            await new Promise(resolve => setTimeout(resolve, 300));

            // DotCodeSchool should have received the tutorial state
            const receivedStates = dotCodeSchoolHandler.getEvents('tutorialStateReceived');
            expect(receivedStates.length).to.be.greaterThan(0);

            const receivedState = receivedStates[0];
            if (receivedState.type === 'tutorialStateReceived') {
                expect(receivedState.state.tutorialTitle).to.equal('JavaScript Advanced Concepts');
                expect(receivedState.state.stepContent.title).to.equal('Async/Await Patterns');
                expect(receivedState.state.stepContent.index).to.equal(6);
            }

            console.log('\n📤 Phase 6: VS Code sends more tutorial states');

            // VS Code can send additional tutorial states
            const additionalState: TutorialSyncState = {
                tutorialId: asTutorialId('javascript-advanced'),
                tutorialTitle: 'JavaScript Advanced Concepts',
                totalSteps: 12,
                isShowingSolution: true,
                stepContent: {
                    id: 'step-8',
                    title: 'Promises and Error Handling',
                    commitHash: 'xyz789abc',
                    type: 'solution',
                    index: 7
                },
                repoUrl: 'https://github.com/vscode-user/js-advanced'
            };

            vsCodeClient.tutorial.sendState(additionalState);
            await new Promise(resolve => setTimeout(resolve, 100));

            // DotCodeSchool should receive this additional state
            const additionalReceivedStates = dotCodeSchoolHandler.getEvents('tutorialStateReceived');
            expect(additionalReceivedStates.length).to.be.greaterThan(1); // Should have at least 2 states now

            const latestState = additionalReceivedStates[additionalReceivedStates.length - 1];
            if (latestState.type === 'tutorialStateReceived') {
                expect(latestState.state.stepContent.title).to.equal('Promises and Error Handling');
                expect(latestState.state.isShowingSolution).to.be.true;
            }

            const sessionInfo = await vsCodeClient.session.info();
            console.log('sessionInfo', sessionInfo);
            expect(sessionInfo).to.not.be.null;
            expect(sessionInfo!.id).to.equal(session.id);
            expect(sessionInfo?.clientCount).to.equal(2);

            console.log('\n✅ Phase 7: Final validation');

            // Verify both clients are still connected and in correct states
            expect(vsCodeClient.is.connected()).to.be.true;
            expect(dotCodeSchoolClient.is.connected()).to.be.true;
            expect(vsCodeClient.is.active()).to.be.true;
            expect(dotCodeSchoolClient.is.passive()).to.be.true;

            // Verify we received all expected tutorial states
            expect(receivedStates.length).to.be.greaterThan(0);
            expect(additionalReceivedStates.length).to.be.greaterThan(1);

            console.log('\n🎯 VS Code ↔ DotCodeSchool communication test completed successfully!');

        } finally {
            // Cleanup
            dotCodeSchoolClient.disconnect();
            vsCodeClient.disconnect();

            console.log('\n🧹 Clients disconnected');
        }
    });

    it('should handle error scenarios gracefully', async () => {
        const vsCodeHandler = new VSCodeEventHandler();
        const vsCodeClient = new RelayClient({
            serverUrl: `ws://localhost:${port}`,
            sessionEndpoint: '/api/sessions',
            eventHandler: vsCodeHandler
        });

        vsCodeHandler.setClient(vsCodeClient);

        try {
            // Test connecting to non-existent session
            try {
                await vsCodeClient.connect('non-existent-session-id');
                expect.fail('Should have thrown an error for non-existent session');
            } catch (error) {
                expect(error).to.be.instanceOf(Error);
            }

            // Test invalid operations while disconnected
            const invalidState: TutorialSyncState = {
                tutorialId: asTutorialId('test'),
                tutorialTitle: 'Test',
                totalSteps: 1,
                isShowingSolution: false,
                stepContent: {
                    id: 'step-1',
                    title: 'Test Step',
                    commitHash: 'test123',
                    type: 'section',
                    index: 0
                },
                repoUrl: 'https://github.com/test/test'
            };

            expect(() => vsCodeClient.tutorial.sendState(invalidState)).to.throw();
            expect(() => vsCodeClient.control.offerToPeer()).to.throw();

        } finally {
            if (vsCodeClient.is.connected()) {
                vsCodeClient.disconnect();
            }
        }
    });
}); 