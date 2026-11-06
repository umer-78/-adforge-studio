import type { HandlerMap } from '../runner';
import { adsLaunch, adsStatus, adsSync } from './ads';
import { agentStep } from './agent';
import { mediaAnalyze, mediaScore } from './analyze';
import { audioProcess } from './audio';
import { adClone, inspirationAnalyze } from './clone';
import { competitorsSync } from './competitors';
import { aiFinalize, aiGenerate, aiPoll } from './generate';
import { mediaDetect, mediaProcess } from './media';
import { productImport } from './product';
import { publishMetrics, publishPost } from './publish';
import { mediaReframe } from './reframe';
import { renderTimeline } from './render';
import { scriptWrite } from './script';
import { stockImport } from './stock';
import { storagePurge } from './storage';
import { trashPurge } from './trash';
import { variantsPlan, variantsRender } from './variants';

/** Every job type has exactly one handler; the type map makes a missing one a compile error. */
export const HANDLERS: HandlerMap = {
  'media.process': mediaProcess,
  'media.analyze': mediaAnalyze,
  'media.score': mediaScore,
  'media.detect': mediaDetect,
  'media.reframe': mediaReframe,
  'audio.process': audioProcess,
  'ai.generate': aiGenerate,
  'ai.finalize': aiFinalize,
  'ai.poll': aiPoll,
  'render.timeline': renderTimeline,
  'publish.post': publishPost,
  'publish.metrics': publishMetrics,
  'product.import': productImport,
  'stock.import': stockImport,
  'script.write': scriptWrite,
  'ad.clone': adClone,
  'inspiration.analyze': inspirationAnalyze,
  'competitors.sync': competitorsSync,
  'variants.plan': variantsPlan,
  'variants.render': variantsRender,
  'ads.launch': adsLaunch,
  'ads.status': adsStatus,
  'ads.sync': adsSync,
  'agent.step': agentStep,
  'trash.purge': trashPurge,
  'storage.purge': storagePurge,
};
