// lib/email-processor.ts - Separate module for the EmailProcessingApp
import { StateGraph, Annotation, END, START } from "@langchain/langgraph/web";

interface EmailData {
  id: string;
  subject: string;
  from: string;
  date: string;
  body: string;
  // ... other email properties
}

interface ApplicationState {
  email: EmailData;
  isJobRelated?: boolean;
  jobData?: any;
  isFirstInstance?: boolean;
  applicationStatus?: string;
  knownApplications?: Record<string, any>;
  processingStage?: string;
  errors?: string[];
}

export class EmailProcessingApp {
  private stateManager: any;
  private webllmWorker: any;
  private processingGraph: any;

  constructor() {
    this.stateManager = null;
    this.webllmWorker = null;
    this.processingGraph = null;
  }

  async initialize() {
    try {
      // Dynamically import to avoid server-side execution
      const { ApplicationStateManager } = await import('./state-manager');
      const { WebLLMWorker } = await import('./webllm-worker');

      this.stateManager = new ApplicationStateManager();
      await this.stateManager.initialize();
      
      this.webllmWorker = new WebLLMWorker();
      await this.webllmWorker.initialize();
      
      this.processingGraph = this.createProcessingGraph();
      
      await this.stateManager.loadPersistedState();
    } catch (error) {
      console.error('Failed to initialize EmailProcessingApp:', error);
      throw error;
    }
  }

  private createProcessingGraph() {
    const GraphState = Annotation.Root({
      email: Annotation(),
      isJobRelated: Annotation(),
      jobData: Annotation(),
      isFirstInstance: Annotation(),
      applicationStatus: Annotation(),
      knownApplications: Annotation(),
      processingStage: Annotation(),
      errors: Annotation()
    });

    const workflow = new StateGraph(GraphState)
      .addNode("classifyEmail", this.classifyEmailNode.bind(this))
      .addNode("extractJobData", this.extractJobDataNode.bind(this))
      .addNode("checkFirstInstance", this.checkFirstInstanceNode.bind(this))
      .addNode("determineStatus", this.determineStatusNode.bind(this))
      .addNode("finalizeResult", this.finalizeResultNode.bind(this))
      .addEdge(START, "classifyEmail")
      .addConditionalEdges(
        "classifyEmail",
        (state) => state.isJobRelated ? "extractJobData" : "finalizeResult",
        {
          extractJobData: "extractJobData",
          finalizeResult: "finalizeResult"
        }
      )
      .addEdge("extractJobData", "checkFirstInstance")
      .addEdge("checkFirstInstance", "determineStatus")
      .addEdge("determineStatus", "finalizeResult")
      .addEdge("finalizeResult", END);

    return workflow.compile();
  }

  // Node implementations
  private async classifyEmailNode(state: ApplicationState): Promise<ApplicationState> {
    try {
      const emailContent = `Subject: ${state.email.subject}\nFrom: ${state.email.from}\nContent: ${state.email.body.substring(0, 1000)}`;
      const isJobRelated = await this.webllmWorker.classify(emailContent);
      
      return {
        ...state,
        isJobRelated,
        processingStage: isJobRelated ? "extractJobData" : "finalizeResult"
      };
    } catch (error) {
      return {
        ...state,
        isJobRelated: false,
        errors: [...(state.errors || []), `Classification failed: ${error instanceof Error ? error.message : String(error)}`],
        processingStage: "finalizeResult"
      };
    }
  }

  private async extractJobDataNode(state: ApplicationState): Promise<ApplicationState> {
    try {
      const emailContent = `Subject: ${state.email.subject}\nFrom: ${state.email.from}\nContent: ${state.email.body}`;
      const jobData = await this.webllmWorker.extractJobData(emailContent);
      
      return {
        ...state,
        jobData,
        processingStage: "checkFirstInstance"
      };
    } catch (error) {
      return {
        ...state,
        jobData: null,
        errors: [...(state.errors || []), `Job data extraction failed: ${error instanceof Error ? error.message : String(error)}`],
        processingStage: "checkFirstInstance"
      };
    }
  }

  private async checkFirstInstanceNode(state: ApplicationState): Promise<ApplicationState> {
    try {
      if (!state.jobData || !state.jobData.company_name) {
        return {
          ...state,
          isFirstInstance: false,
          processingStage: "determineStatus"
        };
      }

      const appKey = `${state.jobData.company_name}_${state.jobData.job_title || 'unknown'}`;
      const knownApps = state.knownApplications || {};
      const isFirstInstance = !(appKey in knownApps);

      if (isFirstInstance) {
        knownApps[appKey] = {
          ...state.jobData,
          first_seen: state.email.date,
          status_history: ["applied"],
          email_count: 1
        };
      } else {
        knownApps[appKey].email_count = (knownApps[appKey].email_count || 0) + 1;
      }

      return {
        ...state,
        isFirstInstance,
        knownApplications: knownApps,
        processingStage: "determineStatus"
      };
    } catch (error) {
      return {
        ...state,
        isFirstInstance: false,
        errors: [...(state.errors || []), `First instance check failed: ${error instanceof Error ? error.message : String(error)}`],
        processingStage: "determineStatus"
      };
    }
  }

  private async determineStatusNode(state: ApplicationState): Promise<ApplicationState> {
    try {
      const emailContent = `Subject: ${state.email.subject}\nContent: ${state.email.body.substring(0, 1000)}`;
      const applicationStatus = await this.webllmWorker.determineStatus(emailContent, state.email.subject);
      
      // Update status history
      if (state.jobData && state.knownApplications) {
        const appKey = `${state.jobData.company_name}_${state.jobData.job_title || 'unknown'}`;
        if (state.knownApplications[appKey]) {
          state.knownApplications[appKey].status_history = state.knownApplications[appKey].status_history || [];
          state.knownApplications[appKey].status_history.push(applicationStatus);
          state.knownApplications[appKey].current_status = applicationStatus;
        }
      }

      return {
        ...state,
        applicationStatus,
        processingStage: "finalizeResult"
      };
    } catch (error) {
      return {
        ...state,
        applicationStatus: "unknown",
        errors: [...(state.errors || []), `Status determination failed: ${error instanceof Error ? error.message : String(error)}`],
        processingStage: "finalizeResult"
      };
    }
  }

  private async finalizeResultNode(state: ApplicationState): Promise<ApplicationState> {
    // Save state to IndexedDB
    if (this.stateManager && state.knownApplications) {
      await this.stateManager.updateKnownApplications(state.knownApplications);
    }

    return state;
  }

  async processEmailsChronologically(emails: EmailData[]) {
    const results = [];
    const knownApplications = await this.stateManager.getKnownApplications();

    // Sort emails chronologically
    const sortedEmails = emails.sort((a, b) => 
      new Date(a.date).getTime() - new Date(b.date).getTime()
    );

    for (const email of sortedEmails) {
      try {
        const initialState: ApplicationState = {
          email,
          knownApplications,
          processingStage: "classify",
          errors: []
        };

        const finalState = await this.processingGraph.invoke(initialState);
        
        // Update persistent state
        if (finalState.knownApplications) {
          await this.stateManager.updateKnownApplications(finalState.knownApplications);
        }

        results.push({
          emailId: email.id,
          isJobRelated: finalState.isJobRelated || false,
          jobData: finalState.jobData || null,
          isFirstInstance: finalState.isFirstInstance || false,
          applicationStatus: finalState.applicationStatus || "unknown",
          processingErrors: finalState.errors || []
        });

      } catch (error) {
        results.push({
          emailId: email.id,
          isJobRelated: false,
          jobData: null,
          isFirstInstance: false,
          applicationStatus: "error",
          processingErrors: [error instanceof Error ? error.message : String(error)]
        });
      }
    }

    return results;
  }
}
