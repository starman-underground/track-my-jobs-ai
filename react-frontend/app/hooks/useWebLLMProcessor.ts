// import { useState, useEffect, useCallback, useRef } from "react";
// import type { EmailData, ProcessedEmail, ApplicationTracker, ProcessingState, JobAppData } from "../types/email-processing";'

// export const useWebLLMProcessor = () => {
//     const [processingState, setProcessingState] = useState<ProcessingState>({
//         isProcessing: false,
//         processedCount: 0,
//         totalCount: 0,
//         results: [],
//         errors: [],
//     });
//     const [applicationTracker, setApplicationTracker] = useState<ApplicationTracker>({});
//     const workerRef = useRef<Worker | null>(null);
//     const messageId = useRef(0);
//     const pendingRequests = useRef(new Map<number, { resolve: Function; reject: Function }>);

//     useEffect(() => {
//         const initializeWorker = async () => {
//             try {
//                 const workerCode = `
//                     importScripts('https://cdn.jsdelivr.net/npm/@mlc-ai/web-llm@0.2.46/lib/web-llm.min.js');
            
//                     let engine = null;
//                     let isInitialized = false;

//                     self.onmessage = async function(event) {
//                         const { type, id, data } = event.data;

//                         try {
//                             if (type === 'initialize') {
//                                 engine = new WebLLM.MLCEngine();
//                                 await engine.reload(data.model, {
//                                     temperature: data.temperature || 0.1,
//                                     top_p: 0.9
//                                 });
//                                 isInitialized = true;
//                                 self.postMessage({ id, type: 'initialized', success: true });
//                             } else if (type === 'classify') {
//                                 if (!isInitialized) throw new Error('Model not initialized');
//                                 const response = await engine.chat.completions.create({
//                                     messages: [{ role: 'user', content: data.prompt }],
//                                     max_tokens: 10
//                                 });
//                                 const result = response.choices[0].message.content.trim().toUpperCase() === 'YES';
//                                 self.postMessage({ id, type: 'classify', result });
//                             } else if (type === 'extract') {
//                                 if (!isInitialized) throw new Error('Model not initialized');
//                                 const response = await engine.chat.completions.create({
//                                     messages: [{ role: 'user', content: data.prompt }],
//                                     max_tokens: 512
//                                 });
//                                 try {
//                                     const result = JSON.parse(response.choices[0].message.content);
//                                     self.postMessage({ id, type: 'extract', result });
//                                 } catch (e) {
//                                     self.postMessage({ id, type: 'extract', result: null });
//                                 }
//                             } else if (type === 'status') {
//                                 if (!isInitialized) throw new Error('Model not initialized');
//                                     const response = await engine.chat.completions.create({
//                                     messages: [{ role: 'user', content: data.prompt }],
//                                     max_tokens: 20
//                                 });
//                                 const validStatuses = ['applied', 'under_review', 'interview_scheduled', 'interview_completed', 'offer_received', 'offer_accepted', 'rejected', 'withdrawn', 'pending'];
//                                 const status = response.choices[0].message.content.trim().toLowerCase();
//                                 const result = validStatuses.includes(status) ? status : 'pending';
//                                 self.postMessage({ id, type: 'status', result });
//                             }
//                         } catch (error) {
//                         self.postMessage({ id, type: 'error', error: error.message });
//                         }
//                     };
//                 `;
//             } catch (error) {
//                 console.error('Failure to initialize WebLLM worker:', error);
//                 setProcessingState(prev => ({
//                     ...prev,
//                     errors: [...prev.errors, `Initialization failure: ${error}`]
//                 }));
//             }
//         };

//         initializeWorker();

//         return () => {
//             if (workerRef.current) {
//                 workerRef.current.terminate();
//             }
//         }
//     }, []);
// }