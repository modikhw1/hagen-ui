/**
 * Test the learning pipeline to verify deep reasoning is being injected
 */

import { getLearningContext, buildFewShotPrompt } from '../src/lib/services/video/learning'
import { DEEP_REASONING_CHAIN } from '../src/lib/services/video/deep-reasoning'

async function main() {
  console.log('=== TESTING LEARNING PIPELINE ===\n')
  
  // 1. Check that DEEP_REASONING_CHAIN is exported
  console.log('1. Deep Reasoning Chain exists:', !!DEEP_REASONING_CHAIN)
  console.log('   Length:', DEEP_REASONING_CHAIN.length, 'chars')
  console.log('   First 200 chars:', DEEP_REASONING_CHAIN.substring(0, 200).replace(/\n/g, ' '))
  
  // 2. Check buildFewShotPrompt with no examples (should still include reasoning chain)
  console.log('\n2. Testing buildFewShotPrompt with NO examples:')
  const emptyPrompt = buildFewShotPrompt([])
  console.log('   Returns deep reasoning chain:', emptyPrompt.includes('DEEP REASONING') || emptyPrompt.includes('DEEP HUMOR'))
  console.log('   Length:', emptyPrompt.length, 'chars')
  
  // 3. Test with a sample example
  console.log('\n3. Testing buildFewShotPrompt with example:')
  const mockExample = {
    id: 'test-1',
    exampleType: 'humor_interpretation' as const,
    videoSummary: 'A cashier offers a beauty discount but the price stays the same',
    geminiInterpretation: 'Subversion humor - unexpected outcome',
    correctInterpretation: 'Mean humor - the joke is casual rejection, telling her she is not attractive',
    explanation: 'The humor is casual cruelty wrapped in a fake offer. The deep reasoning shows: character dynamic = hope vs rejection, social dynamic = implicit insult about attractiveness.',
    humorTypeCorrection: {
      original: 'subversion',
      correct: 'mean-humor + deadpan-rejection',
      why: 'The subversion label misses that someone is being insulted',
      deep_reasoning: {
        character_dynamic: 'Customer expecting flattery vs. Cashier delivering rejection',
        social_dynamic: 'The customer is being told she is not attractive'
      }
    },
    culturalContext: null,
    visualElements: [],
    tags: [],
    humorTypes: ['mean-humor'],
    qualityScore: 8,
    similarity: 0.78
  }
  
  const promptWithExample = buildFewShotPrompt([mockExample])
  console.log('   Includes reasoning chain:', promptWithExample.includes('DEEP') && promptWithExample.includes('REASONING'))
  console.log('   Includes correction:', promptWithExample.includes('CORRECTION'))
  console.log('   Includes the example summary:', promptWithExample.includes('beauty discount'))
  console.log('   Total length:', promptWithExample.length, 'chars')
  
  // 4. Show a snippet of the full prompt
  console.log('\n4. First 2000 chars of generated prompt:')
  console.log('─'.repeat(60))
  console.log(promptWithExample.substring(0, 2000))
  console.log('─'.repeat(60))
  
  // 5. Test actual retrieval if we have context
  console.log('\n5. Testing actual learning context retrieval:')
  try {
    const context = await getLearningContext({
      transcript: 'Restaurant employee asks customer how many lamb chops they want. Manager says 50, owner says 100, chef refuses to answer and walks away frustrated.',
      title: 'POV restaurant estimates'
    })
    
    console.log('   Found context:', !!context)
    console.log('   Context length:', context.length, 'chars')
    console.log('   Includes deep reasoning:', context.includes('DEEP'))
  } catch (error) {
    console.log('   Retrieval error (expected if no DB connection):', (error as Error).message)
  }
  
  console.log('\n=== PIPELINE VERIFICATION COMPLETE ===')
}

main().catch(console.error)
