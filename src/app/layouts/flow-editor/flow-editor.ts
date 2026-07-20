import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, HostListener, ViewChild, computed, effect, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { environment } from '@environment';
import { FlowBlock, FlowData } from '@models/flow';
import { EditorSidebar } from "@pages/main/editor-sidebar/editor-sidebar";
import { Flow } from '@models/flow';
import { Authorization } from '@services/authorization/authorization';
import { BlocksService } from '@services/blocks/blocks';
import { ConfirmDialogService } from '@services/dialogs/confirm-dialog';
import { FlowsService } from '@services/flows/flows';
import { AssistantSessionStore } from '@stores/assistant-session-store';
import { EditorStateHolder } from '@stores/flow-editor';
import { FlowAssistant } from '@shared/flow-assistant/flow-assistant';
import { FlowValidationPanel } from '@shared/flow-validation-panel/flow-validation-panel';
import { TitleToolbar } from "@shared/title-toolbar/title-toolbar";
import { ReteEditor } from "@shared/rete-editor/rete-editor";
import { firstValueFrom } from 'rxjs';

type TourStep = {
  id: string;
  target: string;
  title: string;
  description: string;
  sidebarSection?: 'flows' | 'blocks' | 'containers';
};

@Component({
  selector: 'app-flow-editor',
  imports: [CommonModule, EditorSidebar, TitleToolbar, ReteEditor, FlowAssistant, FlowValidationPanel, MatButtonModule, MatCardModule, MatIconModule, MatTooltipModule],
  templateUrl: './flow-editor.html',
  styleUrl: './flow-editor.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class FlowEditor {
  private static readonly SIDEBAR_OPEN_DELAY_MS = 320;
  private static readonly TOUR_SEEN_KEY_PREFIX = 'editor-guided-tour-seen:';
  @ViewChild(EditorSidebar) editorSidebar?: EditorSidebar;
  @ViewChild('createAssistant') createAssistant?: FlowAssistant;

  private editorState: EditorStateHolder = inject(EditorStateHolder);
  private authorization = inject(Authorization);
  private flowsService = inject(FlowsService);
  private blocksService = inject(BlocksService);
  private confirm = inject(ConfirmDialogService);
  private assistantSessionStore = inject(AssistantSessionStore);
  private tourBootstrapped = false;
  private demoFlowId: string | null = null;

  assistantEnabled = environment.assistantEnabled;
  assistantOpen = signal(true);
  activeRightPanel = signal<'assistant' | 'errors'>('assistant');
  aiCreationRequested = signal(false);
  aiCreationMinimized = signal(false);
  createAssistantCancellable = signal(false);
  creatingFlowFromEmpty = signal(false);
  flow = this.editorState.currentFlow; 
  readonly = this.editorState.isCurrentFlowReadOnly;
  validationErrors = this.editorState.flowValidationErrors;
  validationErrorCount = computed(() => this.validationErrors().length);
  showAssistantPanel = computed(() =>
    this.assistantEnabled && !this.readonly() && !!this.flow()
  );
  showCreateAssistantModal = computed(() =>
    this.assistantEnabled && this.aiCreationRequested() && !this.aiCreationMinimized() && !this.flow()
  );
  showCreateAssistantFloatingButton = computed(() =>
    this.assistantEnabled && this.aiCreationRequested() && this.aiCreationMinimized() && !this.flow()
  );
  tourActive = signal(false);
  tourStepIndex = signal(0);
  tourSpotlightStyle = signal<Record<string, string>>({});
  tourCardStyle = signal<Record<string, string>>({});

  tourSteps = computed<TourStep[]>(() => {
    const steps: TourStep[] = [
      {
        id: 'sidebar-shell',
        target: 'editor-sidebar-shell',
        title: 'Sidebar',
        description: 'This is the editor sidebar. It can stay collapsed, but it is the main entry point for opening flows and adding nodes to the canvas.',
        sidebarSection: 'flows'
      },
      {
        id: 'sidebar-flows',
        target: 'editor-sidebar-flows',
        title: 'Flows',
        description: 'Use the Flows section to create, open, delete or clone an existing flow before editing. Flow can be Private or Public. You can only edit Private flows or Public flows that you have created.',
        sidebarSection: 'flows'
      },
      {
        id: 'sidebar-blocks',
        target: 'editor-sidebar-blocks',
        title: 'Blocks',
        description: 'Blocks are the standard workflow nodes used to build the flow logic, drag them into the canvas.',
        sidebarSection: 'blocks'
      },
      {
        id: 'sidebar-containers',
        target: 'editor-sidebar-containers',
        title: 'Containers',
        description: 'Containers are reusable flow nodes that can embed a subflow and expose a public interface, drag them into the canvas.',
        sidebarSection: 'containers'
      },
      {
        id: 'canvas-demo',
        target: 'editor-canvas',
        title: 'Demo Flow',
        description: 'This is the edit window: add blocks, place them on the canvas, and connect outputs to inputs.'
      },
      {
        id: 'save-demo',
        target: 'editor-save',
        title: 'Save Changes',
        description: 'Use Save to persist your flow.'
      },
      {
        id: 'execute-flow',
        target: 'editor-execute',
        title: 'Execute a Valid Flow',
        description: 'Once the flow is completed, saved and valid, the Execute button is automatically enabled and you can execute it.',
      }
    ];

    return steps;
  });

  activeTourStep = computed(() => this.tourSteps()[this.tourStepIndex()] ?? null);

  constructor() {
    void this.blocksService.getBiasAnnotationsDescriptor().catch((error) => {
      console.error('Retrieve bias annotations descriptor failed', error);
    });
    effect(() => {
      const username = this.authorization.loggedInUser()?.username ?? null;
      if (!username || this.tourBootstrapped) return;
      this.tourBootstrapped = true;
      queueMicrotask(() => {
        void this.startTourIfNeeded();
      });
    });

    effect(() => {
      if (!this.tourActive()) return;
      this.activeTourStep();
      setTimeout(() => this.syncTourLayout());
    });

    effect(() => {
      if (this.validationErrorCount() > 0) {
        this.activeRightPanel.set('errors');
      }
    });

    effect(() => {
      if (this.activeRightPanel() === 'errors' && this.validationErrorCount() === 0) {
        this.activeRightPanel.set('assistant');
      }
    });

    effect(() => {
      if (this.aiCreationRequested() && this.flow()) {
        this.aiCreationRequested.set(false);
        this.aiCreationMinimized.set(false);
        this.createAssistantCancellable.set(false);
      }
    });

    queueMicrotask(() => this.restoreMinimizedCreateAssistantIfAvailable());
  }

  toggleAssistant() {
    this.assistantOpen.update((value) => !value);
    if (this.tourActive()) {
      setTimeout(() => this.syncTourLayout());
    }
  }

  setRightPanel(panel: 'assistant' | 'errors') {
    this.activeRightPanel.set(panel);
    if (!this.assistantOpen()) {
      this.assistantOpen.set(true);
    }
  }

  @HostListener('window:resize')
  onWindowResize() {
    if (!this.tourActive()) return;
    this.syncTourLayout();
  }

  previousTourStep() {
    if (this.tourStepIndex() <= 0) return;
    this.tourStepIndex.update((value) => value - 1);
    this.ensureSidebarForStep();
  }

  async nextTourStep() {
    const currentStep = this.activeTourStep();
    if (currentStep?.id === 'save-demo') {
      await this.saveDemoFlowAndOpenExecutable();
    }

    if (this.tourStepIndex() >= this.tourSteps().length - 1) {
      await this.closeTour(true);
      return;
    }
    this.tourStepIndex.update((value) => value + 1);
    this.ensureSidebarForStep();
  }

  async skipTour() {
    await this.closeTour(true);
  }

  openFlowsSidebar() {
    this.editorSidebar?.openSide('flows');
  }

  async openCreateWithAi() {
    if (!this.assistantEnabled) return;
    if (this.flow()) {
      if (this.editorState.isDirty()) {
        const confirmed = await this.confirm.open(
          'You have unsaved changes. Close this flow and create a new AI draft?'
        );
        if (!confirmed) return;
      }
      this.editorState.closeDocument();
    }
    this.aiCreationRequested.set(true);
    this.aiCreationMinimized.set(false);
    this.activeRightPanel.set('assistant');
    this.assistantOpen.set(true);
  }

  minimizeCreateWithAi() {
    if (!this.aiCreationRequested() || !this.createAssistantCancellable()) return;
    this.aiCreationMinimized.set(true);
  }

  restoreCreateWithAi() {
    if (!this.aiCreationRequested()) return;
    this.aiCreationMinimized.set(false);
  }

  async closeCreateWithAi() {
    const assistant = this.createAssistant;
    if (assistant?.hasCancellableCall()) {
      const confirmed = await this.confirm.open(
        'An assistant request is still running. Cancel it and close AI flow creation?'
      );
      if (!confirmed) return;

      const cancelled = await assistant.cancelActiveCall();
      if (!cancelled) return;
      assistant.clearActiveSnapshot();
    }

    this.aiCreationRequested.set(false);
    this.aiCreationMinimized.set(false);
    this.createAssistantCancellable.set(false);
  }

  async createFlowFromEmpty() {
    if (this.creatingFlowFromEmpty()) return;
    this.creatingFlowFromEmpty.set(true);
    try {
      const flow = await firstValueFrom(this.flowsService.createNewFlow());
      await this.editorState.openDocument(flow, { skipDirtyCheck: true });
      this.openFlowsSidebar();
    } catch (err) {
      console.error('Failed to create flow from empty state', err);
    } finally {
      this.creatingFlowFromEmpty.set(false);
    }
  }

  private async startTourIfNeeded() {
    const username = this.authorization.loggedInUser()?.username ?? null;
    if (!username) return;
    if (!environment.tourModeAlwaysOn && this.hasSeenTour(username)) return;

    await this.prepareDemoFlow();
    this.tourStepIndex.set(0);
    this.ensureSidebarForStep();
    this.tourActive.set(true);
    setTimeout(() => this.syncTourLayout());
  }

  private async closeTour(_markSeen: boolean) {
    const username = this.authorization.loggedInUser()?.username ?? null;
    if (_markSeen && username && !environment.tourModeAlwaysOn) {
      localStorage.setItem(`${FlowEditor.TOUR_SEEN_KEY_PREFIX}${username}`, 'true');
    }

    await this.cleanupDemoFlow();
    this.tourActive.set(false);
    this.tourSpotlightStyle.set({});
    this.tourCardStyle.set({});
  }

  private syncTourLayout() {
    const step = this.activeTourStep();
    if (!step) return;
    const sidebarOpened = this.ensureSidebarForStep();
    if (sidebarOpened) {
      setTimeout(() => this.syncTourLayout(), FlowEditor.SIDEBAR_OPEN_DELAY_MS);
      return;
    }

    const target = document.querySelector<HTMLElement>(`[data-tour="${step.target}"]`);
    if (!target) {
      this.nextTourStep();
      return;
    }

    const rect = target.getBoundingClientRect();
    const padding = 10;
    const spotlightTop = Math.max(8, rect.top - padding);
    const spotlightLeft = Math.max(8, rect.left - padding);
    const spotlightWidth = Math.max(120, rect.width + padding * 2);
    const spotlightHeight = Math.max(56, rect.height + padding * 2);

    this.tourSpotlightStyle.set({
      top: `${spotlightTop}px`,
      left: `${spotlightLeft}px`,
      width: `${spotlightWidth}px`,
      height: `${spotlightHeight}px`
    });

    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const rightSideSteps = new Set(['sidebar-shell', 'sidebar-flows', 'sidebar-blocks', 'sidebar-containers']);
    const cardWidth = 320;
    const preferredLeft = Math.min(
      viewportWidth - 340,
      rightSideSteps.has(step.id)
        ? Math.max(16, rect.right + 24)
        : Math.max(16, rect.left)
    );
    const preferredTop = rect.bottom + 18 + 220 <= viewportHeight
      ? rect.bottom + 18
      : Math.max(16, rect.top - 220);

    this.tourCardStyle.set({
      top: `${preferredTop}px`,
      left: `${Math.min(preferredLeft, viewportWidth - cardWidth - 16)}px`
    });
  }

  private async prepareDemoFlow() {
    if (this.demoFlowId) return;

    const demoFlow = await firstValueFrom(this.flowsService.createNewFlow('Guided Tour Demo'));
    this.demoFlowId = demoFlow.id;
    await this.editorState.openDocument(demoFlow, { skipDirtyCheck: true });

    const demoData = await this.buildDemoFlowData();
    this.editorState.updateData(demoData);
  }

  private async buildDemoFlowData(): Promise<FlowData> {
    const flowId = this.editorState.currentFlow()?.id ?? null;
    const firstBlock = await firstValueFrom(this.blocksService.createEmptyBlock('LLMBlock', { flowId }));
    const secondBlock = await firstValueFrom(this.blocksService.createEmptyBlock('LLMBlock', { flowId }));

    const left = this.decorateDemoBlock(firstBlock, 'Collect Prompt', { x: 140, y: 180 });
    const right = this.decorateDemoBlock(secondBlock, 'Generate Answer', { x: 520, y: 180 });
    const sourceOutput = left.outputs[0]?.name ?? 'output';
    const targetInput = right.inputs[0]?.name ?? 'input';

    return {
      blocks: [left, right],
      containers: [],
      connections: [
        {
          id: globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-demo-connection`,
          sourceId: left.id,
          sourceName: sourceOutput,
          targetId: right.id,
          targetName: targetInput
        }
      ],
      dependencies: [],
      globalInputs: []
    };
  }

  private decorateDemoBlock(block: FlowBlock, name: string, position: { x: number; y: number }): FlowBlock {
    const specificConfiguration: Record<string, unknown> = {
      ...(block.specificConfiguration ?? {}),
      name
    };

    if (typeof specificConfiguration['prompt'] === 'string') {
      specificConfiguration['prompt'] = name === 'Collect Prompt'
        ? 'Ask for the user topic and prepare a short prompt.'
        : 'Generate a short answer using the previous block output.';
    }

    return {
      ...block,
      name,
      position,
      specificConfiguration
    };
  }

  private async saveDemoFlowAndOpenExecutable() {
    if (this.editorState.isDirty() && this.flow()?.id === this.demoFlowId) {
      await firstValueFrom(this.editorState.save());
    }

    this.editorSidebar?.openSide('flows');
    const executableFlow = await this.findExecutableFlow();
    if (executableFlow) {
      await this.editorState.openDocument(executableFlow, { skipDirtyCheck: true });
    }
  }

  private async findExecutableFlow(): Promise<Flow | null> {
    const flowsSignal = await this.flowsService.getAllFlows();
    const flows = flowsSignal();
    return flows.find((flow) => flow.status === 'EXECUTABLE' && flow.id !== this.demoFlowId) ?? null;
  }

  private async cleanupDemoFlow() {
    if (!this.demoFlowId) return;

    const demoFlowId = this.demoFlowId;
    this.demoFlowId = null;
    if (this.flow()?.id === demoFlowId) {
      this.editorState.closeDocument();
    }

    try {
      await firstValueFrom(this.flowsService.deleteFlow(demoFlowId));
    } catch (err) {
      console.error('Failed to delete guided tour demo flow', err);
    }
  }

  private hasSeenTour(username: string): boolean {
    return localStorage.getItem(`${FlowEditor.TOUR_SEEN_KEY_PREFIX}${username}`) === 'true';
  }

  private restoreMinimizedCreateAssistantIfAvailable() {
    if (!this.assistantEnabled || this.flow() || this.aiCreationRequested()) return;
    if (!this.assistantSessionStore.hasSnapshot(AssistantSessionStore.CREATE_MODAL_FLOW_KEY)) return;

    this.aiCreationRequested.set(true);
    this.aiCreationMinimized.set(true);
  }

  private ensureSidebarForStep(): boolean {
    const section = this.activeTourStep()?.sidebarSection;
    if (!section) return false;
    if (this.editorSidebar?.collapsed() || this.editorSidebar?.open !== section) {
      this.editorSidebar?.openSide(section);
      return true;
    }
    return false;
  }
}
