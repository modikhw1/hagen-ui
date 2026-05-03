# Layer 1 Calibration File

> **Purpose**: Map the unknown pyramid of variables that determine video value.
> Each layer builds on the previous. Variables should only exist in their proper layer.
> 
> **How to use**:
> - Change `importance: 0.5` to your value (0-1 scale). Unchanged = not yet evaluated.
> - Fill in `comment: ""` with your reasoning.
> - Flag variables that belong in a different layer.

---

## THE PYRAMID MODEL

```
                    ▲
                   /|\
                  / | \
                 /  |  \      LAYER 4: Strategic Timing (Future)
                /   |   \     "When to post this type of content"
               /_________|    
              /     |     \
             /      |      \   LAYER 3: Trend Alignment (Future)
            /       |       \  "Does this fit current market momentum"
           /_________|_______\
          /         |         \
         /          |          \ LAYER 2: Audience Fit (Future)
        /           |           \"Will businesses want to replicate this"
       /___________|___________\
      /             |             \
     /              |              \ LAYER 1: Content Analysis (CURRENT)
    /               |               \"What is this video, objectively + subjectively"
   /_______________|_______________\

   Total Coverage Target: 100%
   Current Layer 1 Coverage: ___% (fill in Section E)
```

---

## LAYER 1: CONTENT ANALYSIS

This layer answers: "What is this video, and what are its properties?"

---

### 1A. Visual Properties (Gemini-derived)

```yaml
gemini_visual_hookStrength:
  correlation: 0.48
  direction: "higher = you rate higher"
  importance: 0.6
  comment: "Is as relevant that one would expect for a viral video. Will be strengthened with views, likes and similar calculations. Important"
  belongs_in_layer: 1

gemini_visual_overallQuality:
  correlation: -0.60
  direction: "higher = you rate LOWER"
  importance: 0.4
  comment: "Quality in video and audio is not entirely relevant, but will likely affect likes/views and therefore viralability. Scripts/concept can be strong without visual quality, but visual quality helps in viralability (viral = x(script/concept) * y(overallQuality)"
  belongs_in_layer: 1

gemini_visual_colorDiversity:
  correlation: -0.49
  direction: "higher = you rate lower"
  importance: 0.4
  comment: "Purely technical, likely affects viralability and viewability, but does not play a big role in 'upload video' function."
  belongs_in_layer: 1

gemini_visual_compositionQuality:
  correlation: null
  direction: "no clear pattern yet"
  importance: 0.5
  comment: ""
  belongs_in_layer: 1

gemini_text_overlay_count:
  correlation: 0.59
  direction: "more text = you rate higher"
  importance: 0.5
  comment: "Text would indicate a serious business putting emphasis on high quality content. If they have a content team, subtitles would be expected. This wouldn't make a video 'stronger' per say, but would affect views and viralability."
  belongs_in_layer: 1

gemini_transition_count:
  correlation: 0.20
  direction: "weak positive"
  importance: 0.6
  comment: "At least a couple of transitions would be relevant. For viral videos with some type of skit/concept, it would help with transitions"
  belongs_in_layer: 1
```

---

### 1B. Audio Properties (Gemini-derived)

```yaml
gemini_audio_quality:
  correlation: 0.45
  direction: "higher = you rate higher"
  importance: 0.5
  comment: "Not relevant for the estimation function (upload function), as the video reproduction would mainly base itself on the uploaders (replicator business) ability to produce high production value"
  belongs_in_layer: 1

gemini_audio_audioEnergy:
  correlation: 0.15
  direction: "weak positive"
  importance: 0.5
  comment: "Same as 'gemini_audio_quality'"
  belongs_in_layer: 1

gemini_audio_hasVoiceover:
  correlation: 0.33
  direction: "voiceover = slightly higher"
  importance: 0.5
  comment: "Same as 'gemini_audio_quality'"
  belongs_in_layer: 1

gemini_has_sound_effects:
  correlation: 0.43
  direction: "sound effects = higher"
  importance: 0.5
  comment: "Is valuable, and shows that the initial video has production value'"
  belongs_in_layer: 1
```

---

### 1C. Technical Properties (Gemini-derived)

```yaml
gemini_technical_pacing:
  correlation: 0.20
  direction: "weak positive"
  importance: 0.5
  comment: ""
  belongs_in_layer: 1

gemini_technical_cutsPerMinute:
  correlation: 0.37
  direction: "more cuts = higher"
  importance: 0.5
  comment: ""
  belongs_in_layer: 1

gemini_duration_seconds:
  correlation: 0.10
  direction: "longer = slightly higher"
  importance: 0.6
  comment: "I would try to seek some type of data talking about optimal length for a marketing video. My guess would be 20-30 seconds max, and 8 second minimum"
  belongs_in_layer: 1
```

---

### 1D. Engagement Predictions (Gemini-derived)

```yaml
gemini_engagement_attentionRetention:
  correlation: -0.07
  direction: "no effect"
  importance: 0.5
  comment: "Would give insight into viralability "
  belongs_in_layer: 1
  flag: "might belong in layer 2 or 3?"

gemini_engagement_shareability:
  correlation: -0.10
  direction: "no effect"
  importance: 0.7
  comment: "Important"
  belongs_in_layer: 1
  flag: "might belong in layer 2 or 3?"

gemini_engagement_replayValue:
  correlation: -0.11
  direction: "no effect"
  importance: 0.7
  comment: ""
  belongs_in_layer: 1

gemini_engagement_scrollStopPower:
  correlation: 0.15
  direction: "weak positive"
  importance: 0.5
  comment: ""
  belongs_in_layer: 1
```

---

### 1E. Your Explicit Ratings (Human-derived)

```yaml
hook:
  correlation: 0.85
  direction: "STRONGEST predictor"
  importance: 0.5
  comment: "Hook keeps the viewer on the video. A strong concept allows for a relationship to build, and a tone to be found and placed for the viewer."
  belongs_in_layer: 1

payoff:
  correlation: 0.68
  direction: "strong predictor"
  importance: 0.6
  comment: "Generally important for marketing videos."
  belongs_in_layer: 1

originality:
  correlation: -0.19
  direction: "slight negative"
  importance: 0.8
  comment: "Important for a service that provides scripts. If viralability is high then originality would be translated to new languages/cultures. If the originality factor is deemed culturually neutral, this means it's accessible and engaging for many, while holding attention or playing on a meme/cultural insertion (movie trope, classic emotional situation, drama), it has potential and importance for the 'upload function'"
  belongs_in_layer: 1

pacing:
  correlation: -0.11
  direction: "no clear effect"
  importance: 0.7
  comment: "With a good script, pacing can be held. Also engages the content producer (business), that sees the production phase as engaging and not too advanced. Balance between simplicity (not too simple, not too advanced), and time consuming (not 1 minute, but not 3 hours). Pacing relates to amount of shots, practicality etc."
  belongs_in_layer: 1

rewatchable:
  correlation: -0.02
  direction: "no effect"
  importance: 0.5
  comment: "Not the biggest factor, but a good metric for a well made video/concept."
  belongs_in_layer: 1
```

---

### 1F. Missing Variables (Not Yet Captured)

Add variables you think belong in Layer 1 but aren't being measured:

```yaml
replicability:
  correlation: "unknown - not measured"
  direction: "hypothesized positive"
  importance: 0.7
  comment: "Important for the specific niche. Depending on the type of business, replicability would affect the percieved value of the business purchasing the concept/script. If the concept is too different, or assumes certain props/willingness to partake in a certain cultural theme/meme/trope, this can have adverse effects. Perhaps not being happy with the purchase, even though the concept may be strong in itself."
  belongs_in_layer: 1
  description: "Can another business recreate this?"

script_extractable:
  correlation: "unknown - not measured"
  direction: "hypothesized positive"
  importance: 0.6
  comment: "Same as the above in certain regards. The priority would be to have a script that is strong in it's own right, that is strengthened with props or strong production"
  belongs_in_layer: 1
  description: "Is there a clear script/concept to copy?"

resource_requirements:
  correlation: "unknown - not measured"
  direction: "hypothesized negative (more = worse)"
  importance: 0.7
  comment: "Important as it draws limitations unto the audience that may relate to the script. If the props are not available, say certain clothings, or items cannot be replaced easily, then the script will be deemed harder to replicate."
  belongs_in_layer: 1
  description: "Props, actors, equipment needed"

context_dependency:
  correlation: "unknown - not measured"
  direction: "hypothesized negative (more = worse)"
  importance: 0.5
  comment: "This can be both. The non-implemented layer that plays on 'momentum', will take in datapoints such as 'is this a new trend', 'have you seen this unique script before', 'does this play on a new meme, when did you first interact with it', 'is it connected to a new type of hashtag that has viralability'. For this reason, the virality score cannot be increased or decreased connected to a trend. Certain cultural themes could be connected to this value, such as video themes, feeling states, tropes etc."
  belongs_in_layer: 1
  description: "Relies on trends/memes/specific persona?"

# ADD MORE BELOW:
# variable_name:
#   correlation: "unknown"
#   direction: ""
#   importance: 0.5
#   comment: ""
#   belongs_in_layer: 1
#   description: ""
```

---

## LAYER 0.5: VIABILITY GATE

Variables that determine if a video should even enter Layer 1 analysis:

```yaml
is_coherent:
  description: "Is this actual content, not gibberish?"
  gate_type: "pass/fail"
  importance: 0.7
  comment: "If strictly a AI analysis tool, scraping millions of videos and finding strong content with replicability, then this would be relevant. I would assume that most videos, that actually is shown to have reach, will not be gibberish. Of course, one would differentiate between marketing - placed within social norms and expectations to uphold brand guidelines, and other types of content.
  "

has_replicable_concept:
  description: "Is there something to extract?"
  gate_type: "pass/fail"
  importance: 0.5
  comment: ""

is_marketing_relevant:
  description: "Could a business use this?"
  gate_type: "pass/fail"
  importance: 0.5
  comment: ""

is_understandable:
  description: "Language/context accessible?"
  gate_type: "pass/fail"
  importance: 0.5
  comment: ""

# ADD MORE GATES:
# gate_name:
#   description: ""
#   gate_type: "pass/fail"
#   importance: 0.5
#   comment: ""
```

---

## COVERAGE ASSESSMENT

```yaml
layer_1_coverage:
  current_estimate: 0.5
  comment: ""
  what_is_missing: ""

layer_0.5_coverage:
  current_estimate: 0.5
  comment: ""
  what_is_missing: ""

variables_in_wrong_layer:
  list: []
  comment: ""
```

---

## GENERAL COMMENTS

```yaml
comments_for_claude:
  - "It would appear that my thought process in regards to the model/analysis handling is somewhat backwards. When estimating the relative importance of variables, I recognize that my way of valuing a variable is mainly in relation to how an 'upload video' algorithm, to my platform, would function.
  
  For example - for the variable "overallQuality". This is produced by Gemini based on training data on video/audio quality (I would assume). For the average viewer, this does affect viralability, rewatchability or whatever else.

  But in my upload video function, the video quality would not matter. Because the model would mainly look for strong scripts, that function well for the intended purpose which IS to get viral, but it wouldn't matter in that context. Because the video would be re-created, if deemed "GOOD", the video quality in the estimation phase would not be relevant, not the audio either.
  "
  - ""
  - ""

questions:
  - ""
  - ""

observations:
  - ""
  - ""
```

---

## METADATA

```yaml
last_updated: "2025-12-01"
videos_analyzed: 9
ratings_used: 9
variables_evaluated: 0
variables_with_importance_changed: 0
```
