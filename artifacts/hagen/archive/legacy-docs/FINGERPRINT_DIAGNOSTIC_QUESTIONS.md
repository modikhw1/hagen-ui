# Fingerprint System Diagnostic Questions

> **Purpose**: Identify gaps, validate assumptions, and calibrate the fingerprint system toward 90% accuracy.
> 
> **How to use**: Answer each question with your actual expectations. Use ✅ (valid), ❌ (wrong assumption), or 🔶 (partially correct, needs refinement). Add comments in the `→ Your response:` sections.

---

## Meta-Layer 0: The Purpose & Scope

Before diving into technical layers, we need to align on *what problem we're actually solving*.

### Q0.1: What is a "good match"?
When the fingerprint system says "85% match," what should that mean in practice?

- **A)** The candidate video could be posted on the brand's account and feel native
Valid. Not only should it feel like it fits in thematically, emotionally or in terms of what makes sense (the size of business, the size of team for example would point towards replicability), it should also give a sense of excitement, which is in large parts what we are seeking for with the analyze-rate schema - a high quality sketch/concept for the particular brand.

- **B)** The candidate video creator could be hired to make content for the brand
Valid.

- **C)** The candidate video's *style* aligns, even if the topic/product differs
Valid. In it's current state, any type of content that gets a high rating should align with the feeling of the profile. Feeling could be the overall messaging, the age or cultural assumptions, the type of actors being used, the topics that are covered. A good match, where a concept takes place behind a bar, while to recipient business does not have a bar setup, is problematic. This is why replicability in general is an important metric. Other than the hassle of setting up a scene, editing, amount of actors, tougness to perform in a engaging way for the average service business, replicability is meant to figure out what concepts are likely to be replicated. Since we are doing café/restaurants/bars, we hope most content can be translated.

- **D)** Something else entirely?
Partially. A good match is based on the assumption that the sketch is good in itself, can be replicated somewhat easily, is actually "worth" buying (which includes freshness, before everyone else values, as well as proven viralability - likes relative to profile size etc, which hasn't been implemented yet). On top of that is closeness to brand fingerprint - themes, agreement in thought (Cultural, overall coolness posturing, themes taken, risk, humour types)


---

### Q0.2: Who is the end user of a fingerprint?
- A sales team comparing prospects to successful accounts?

Wrong assumption. The fingerprint is used from the service to match content with brands that are very likely to find the purchase worth it.

- A content strategist planning what videos to make?

Partially. The fingerprint is formed and stored by the service. The brand_profile chat function also helps mixing in the customers expectations, and the service takes accountability for this sentence - "If you want a humourous sketch that mixes well with your marketing flow, especially TikTok, and focusing right now on service businesses, you are very likely to enjoy our service and find the purchases useful as standalone uploads the trend and compete with other content". They trust the service for this.

- An AI system auto-matching influencers to brands?

Wrong assumption, not the functionality planned.

- You personally, evaluating potential collaborations?

**

→ Your response:

Overall, the goal is to get a really good understanding of a businesses' current goals, wants, attitude, current strategy, humour, themes, production ambition, business ambition/striving etc. The fingerprint for brands are then a set value, that can be matched with content uploaded and vetted by me or other users.

---

### Q0.3: What's the cost of a false positive vs. false negative?
- **False positive**: System says "good match" but it's actually not

If the system says good match, meaning that the video has a fingerprint that doesn't match the profiles, then a profile would purchase a concept/premise, view the content, and say "this doesn't match us/this is boring/this seems too advanced/this doesn't match the culture in where we operate/this seems like something we could have found for free browsing TikTok/This is heavily trend-bound/meme dependent/This isn't clever/This doesn't fit within our risk-assessment/This wouldn't get approved by our higher ups.

- **False negative**: System says "poor match" but it would've been great

This would lead to content uploads that don't get purchased. The quality of the uploads are ambitioned to be vetted in terms of strength clarity and overall replicability. A poor matchc would not get picked up or purchased, wasting time in adding postings to the marketplace/matchmaking service of content.

Which is worse? This determines how conservative or aggressive we should be.

→ Your response:

Both are not good. The first would lead to unhappy users/refunds, the other would make the data entry work, potentially using humans for input, wasteful.

---

### Q0.4: Should the system differentiate between "this brand SHOULD be like X" vs "this brand IS like X"?
Currently we only measure what a brand *is doing*. But maybe they're doing it poorly and the fingerprint shouldn't perpetuate that?

→ Your response:
This is a good point. The data we can mainly use would be the current postings, and especially the content mix and what type of videos are selected to be created. On TikTok, it's not expected for these brands to come up with the content themselves. A lot of inspiration (copying) is done, and this means that the overall taste/intention can be seen on what is uploaded, despite it being done "badly" or not effectively. But with that said, the Brand-profile (brand discovery) function aims to fill the other side of that. The brand fingerprint asks questions about intention, what the goal is. Although this function isn't entirely mapped out yet, the aim is to match that function to the fingerprint structure, making it so that profile/videos/written intention is combined.

So to answer the question. It can be differentiated if it creates more depth. Offering concepts that entire match the customer, without an "upwards" intention (Basically improving the profile with better content), may not be the best strategy. Undestanding what the brand should or 'could' be, it could lead to some smart recommendation to really make the purchases worth it.

---

### Q0.5: What distinguishes a brand's fingerprint from a single video's analysis?
If I have 10 videos, what emerges at the profile level that doesn't exist at the video level? Currently we average—but should we look for consistency? Range? Evolution over time?

→ Your response:

A brands fingerprint contains the general themes contained - humour, style, preferences, tendencies. A brands fingerprint should also (despite us not having implemented this) contain overall content-mix, also taking account the overall balance between humour and informative content/visually engaging food content (two examples I've seen a lot). This would create a need for some other type of analysis which isn't covered in /analyze-rate, since this only takes the service content recommendation system in priority (is it good or bad?).

A brands fingerprint would also contain bio, follower count, size of team, overall seriousness (meaning how important is a successful content-strategy? This has to do with the survival-idea mentioned in legacy models)

Overall, a brands fingerprint would combine what the owner or content-responsible person for the brand would say about the brand and it's social media presence, as well as subconcious or unsaid things that also affect, including for example ability to create good content (no owner would say "I don't have skills in making good videos").

A video level fingerprint would do it's best to guess all of the above, but focus mainly on the /analyze-rate mechanism to figure out: Is the video good for the marketplace (can it satisfy a vast amount of businesses with high likelyhood), and does this video fit a brand? Many of the values mentioned above can only be alluded to, seeing what is in the actual video. But with enough data point I hope it's possible to get close.

---

## Layer 1: Quality & Service Fit

The first layer assesses whether content is "good" from two angles: (a) useful for your service, and (b) well-executed objectively.

The layer is first because it is the core assumption that needs to be satisfied to go on the marketplace. It needs to be relevant first and foremost. The L1a is useful, and L1b is mainly there to say that: Yes, content that isn't the best for the service can still have viralability. For example content creators without a service business focus, or very edgy and non-safe humour etc. The core difference could be

L1a: Makes sense for the service, fits the mold and has viralability potential (perhaps crossing with actual viral data - likes or shown growth). Of course, the L1a doesn't 'need' to have proven viralability (although this would be good). The reason being that additions to the marketplace is meant to be inserted by real people, vetting and adding good quality content before virality if possible. This makes the USP that content is provided early before other's have gotten to it.

L1b: It has gained virality, or is relatively viral for a profile (likes to follower ratio, meaning explosive growth outperforming profile size. This is an example, just inspiration to what could be used.)

### Q1.1: What makes a video "excellent" vs "good" vs "mediocre"?
Current mapping: excellent=0.9, good=0.7, mediocre=0.5, bad=0.3

Can you articulate the criteria you use when rating? Is it:
- Virality potential?
- Production polish?
- Message clarity?
- Authenticity?
- Something hospitality-specific?

→ Your response:

The videos I deem to be excellent is a concept that usually: Isn't too short, doesn't require too many actors, isn't to simple or one-shot, has a creative sketch or clever joke, not too heavily reliant on props, fun and engaging towards a broad target audience, some edginess/meanness to it (making it less dry), an assumed virality potential, mostly set in the environment (showing off the backdrop), not too obvious/expected, usually absurdist.

The excellence comes from the above, where production polish or performances isn't the most important. When using the service, a standalone sketch can be purchased that is meant to be recreated. For this reason, it would only matter in the stage of buying it, getting to see the original sketch. This would be the reason to have it be high quality, to "sell" it to the user, even if it's expected to be buy first see later.

Good would be acceptable, but assumed to have a less universally fitting idea. The concept may be less creative, have a replicability that requires hassle, too short or too long (usually less than 5 seconds, more than 30s).

Mediocre would be generally boring, or just fall flat in many of the criteria listed above.

Bad would be the same as mediocre, but have an element that makes it unusable. Maybe a theme that is too dark/risky, or playing on sexual themes. 

---

### Q1.2: Are you rating the *video* or the *brand behind it*?
A great brand can make a mediocre video. A nobody can go viral once. Which matters more for fingerprinting?

→ Your response:

Fingerprinting would work the same hopefully for both types of videos. The idea of storing fingerprint values for both, and then matching the relevant aspects of the fingerprint with the users of the service, is the goal.

If the video fingerprint works as intended, the brand will not matter exactly, other than the features of the brand that is expected to matter to the user. Meaning that the brand doesn't matter, but the aspects that the user is expected to recreate/form an opinion about, would be relevant. The video and it's core qualitities, mentioned in Q1.1 would be most valuable.

---

### Q1.3: Should quality be relative to category or absolute?
A "high-production" TikTok from a small café is different from a hotel chain's polished ad. Do we grade on a curve, or is there a universal standard?

→ Your response:

No, the assumption is that there is an universal standard. Especially in regards to good concepts aimed for the service, not being reliant on production value. A small business that puts a lot of effort in production would likely enjoy being recommended content from businesses that have that down as well, but would be too bothered by not having that.

---

### Q1.4: The current L1 split (Service Fit vs Execution Quality) assumes they're separate.
**Service Fit**: "Is this style useful for our clients?"
**Execution Quality**: "Is this well-made regardless of style?"

Is this distinction valuable? Can a video have high execution but low service fit, or vice versa?

→ Your response:

I mentioned this earlier. The "well-made" regardless of style would perhaps find a place on the marketplace, but would be seen by brands that value that style or theme. The aim of the service is to provide balanced and strong concepts that many would enjoy. The other variants, for example quick and easy meme-based concepts, can be found scrolling TikTok and doing the normal - finding inspiration on the site and recreating it.

---

### Q1.5: Execution Quality is computed from 4 signals:
- `execution_coherence` (35%) – message clarity
- `distinctiveness` (35%) – stands out from generic content
- `confidence` (15%) – presenter confidence
- `message_alignment` (15%) – personality matches message

Are these the right signals? Wrong weights? Missing anything?

→ Your response:

Execution coherence: I'm not sure exactly what this would entail. In general, a hindrance to effective content is either that it's boring, doesn't have a good hook, isn't creative or exciting, has a weak payoff, confusing concept, playing on inside jokes etc. This can be used as a value, but I don't know what it represents. Any weighing would have to be found somehow I can't direct right now.

Distinctiveness: Not having it be boring, too short, too reliant on inside jokes/culture-specific themes, is the most important. Distinctiveness could include how many times the video has been seen by users. This type of data could be searched for (scraped), but we assume that it's hard and not accessible right now. One idea was to add a field later, when the content-input agent adds a concept, asking "have you seen this before? If so, how many times". This would add another layer to this metric. But yes. If this value is important to weed out what is not useful, it's useful.

Confidence: Perhaps, I'm not sure.

Message Alignment: Perhaps.

Execution quality, if we're talking production value, can also include editing skill or quality, color quality, audio quality etc.

---

### Q1.6: Quality currently has no engagement data (views, likes, shares).
Is "proven virality" a signal we should include? Or is it noise (luck, timing, algorithm)?

→ Your response:

Yes. It has not been included yet, but can add another dimension. It has not been implemented to create initial clarity for the original algorithm - favoring good quality content without taking meta-data into account. It is definitely timing, luck, algorithm etc.

An initial goal was to make possible 'arbitrage' of content - making it so that videos in one country (e.g Sweden) would be translated to another (e.g Finland), by assuming that the users of both countries are isolated from the other. Engagement data for smaller markets could then be more useful, than the main "for you" algorithm.

---

### Q1.7: How stable should quality be across a brand's videos?
If a brand has 3 excellent videos and 2 mediocre ones, should the fingerprint:
- Average them (current approach)?
- Weight toward the best (aspirational)?
- Flag the inconsistency as a risk?

→ Your response:

The important thing for brand fingerprint isn't the quality in terms of sketches/ideas. It is mainly the type of content they enjoy or have stated to enjoy. But, for the sake of matching brand fingerprint - video fingerprint, it can just create an average or aspirational. It can also just keep track of all of it, saying that it generally goes for x or y, having a somewhat strong baseline and likely putting a lot of effort into their content strategy.

The quality is more important in matching videos to brand. There the quality metric makes sense, as it is used to filter out bad content and not recommend it towards brands.

---

## Layer 2: Personality & Likeness

This layer captures *who the brand is* if it were a person—tone, humor, positioning.

### Q2.1: The "personality as a person" metaphor—is it useful?
We describe brands as having energy, warmth, formality, etc. But does a restaurant have a personality, or does the *owner/content creator* have one?

→ Your response:

The abstraction isn't good in practice, as the brand is an invention that is meant for the audience to attach meaning to. The personality of an individual has similarities, as different traits are related to differently. Generous, intelligent or creative people can draw others in for various people, where instead selfish, low effort and "non-threatening" (safe topics, not being up to trend, not competing for business growth generally)individuals may not be granted attention or attraction.

The brand will have some intentional traits, and some unintentional. Based on the overall impression, general content engagement satisfaction, thumbnails, actors performance, video quality, energy and personality of the brand (everything we're talking about), the social media users will relate to it. Even the users have a free flowing function of discernment, relying on cultural imprints and overall expectations from comparing to other creators. Meaning that there is comparative relating, not absolute rating.

The owners intentiton mixes with ability and understanding of the audience expectation.

---

### Q2.2: How many dimensions actually differentiate brands?
L2 currently has 20+ fields. In practice, how many matter for matching? Could we reduce to 5-7 "core" differentiators?

→ Your response:

Yes and no. If it's focused, there is no problems with sharpening the criteria to fewer differentiators.

---

### Q2.3: The tone metrics (energy/warmth/formality) are 1-10 scales.
What's a meaningful difference? Is 6 vs 7 energy distinguishable, or is it noise?

→ Your response:

I'm not sure what improvements can be made.

---

### Q2.4: Humor is heavily weighted but optional.
Not all hospitality brands use humor. Is the system biased toward funny content? How should we treat brands with no humor presence?

→ Your response:

For the intended channel, TikTok, a big part of our target audience uses humor. In fact, the service is built towards brands that want just that, and it is positioned as such. The reason is that high quality entertaining clips, with a comedic effect, has a unique way of penetrating the noise.

The system may need to take other types of content into account. The analyze-rate is strictly a humor type/rating tool, which doesn't mesh well with profiles that have a mix of humor, meme, informative & visually engaging posts. This mix of content may still be relevant to understand, since it can give some insight into how the brand thinks. It's not common to have a fairly big and professional brand page with only humor. At the same time, the service is meant to give concepts that can be used when needed. In it's current form, the service doesn't promise or market a complete social media mix.

---

### Q2.5: `age_code` (younger/older/balanced) is a proxy for audience.
Is this the right signal? What about urban/suburban, income level, cultural background?

→ Your response:

This metric is mainly about what type of humor/themes will be relevant for what audience. The concepts I have graded as being excellent has an engaging premise/theme/style for people between 15-45. Absurdism tend to do well here.

Within the younger audience, many teens enjoy simple and to the point meme formats, often with a POV text overlay establishing the premise, and having support of a TikTok "sound" as well as a short clip with simple acting. These are simple to replicate, have a quick and easy payoff, and usually uses attractive people in them. These tend to be very quick and 'vapid', making them not the most memorable or in extension - not creating room to relate a (positive) feeling towards the profile.

Themes that seem somewhat popular with younger people, but not only teens, is work drama/gossip, relationships/mating, power structures at work etc.

What seems to work for most is sketches that seem somewhat effortless (not too much planning for the script for example), but with a humorous twist that mixes between meanness, a simple misunderstanding, someone tricking someone else etc. Simple human dynamics played out in a service environment, that is still "safe" but with some dynamics that are more mature or contain some dramatic element.

Cultural background and income is normally matched through user viewing numbers, meaning that any focus for a brand would attract those viewers. This data is likely not relevant to track.

---

### Q2.6: `accessibility` (everyman/aspirational/exclusive/elite) seems crucial.
How well is the AI detecting this? A fancy restaurant trying to seem approachable—how should that tension be captured?

→ Your response:

It would be the language, themes and clothing/grooming/backdrop. I'm not sure about this variable in general, but in general, I would say that any content that is aimed to do well on TikTok will always be accessible, or trying to be.

---

### Q2.7: `edginess` might be the most subjective signal.
"Safe" vs "provocative"—these judgments vary by culture, generation, context. How do we calibrate?

→ Your response:

I think this signal shouldn't be viewed as very subjective. I'm sure if there is some analysis done online, there should be a vast array of data sources describing what type of themes may or may not be deemed as safe for a brand with certain expectations.

There are notes within the /analyze-rate data collection that speak on what type of videos may not work. But in general, hateful or explicitly sexual themes may not work well. Flirting but in a restrained way can sometimes work. And sometimes relationship dynamics are being alluded to, instead of actually shown as a real dynamic.

When a concept is centered around work environment dynamic, some themes may not be good if not shown to be clearly absurdist or ironic. If the team is shown to be incapable, hateful, non-serviceminded, unrespectful - these are generally not good. It also depends on the type of brand and it's size, assuming that bigger brands or companies need to be restrained while smaller profiles may take bigger risks.

---

### Q2.8: `traits_observed` is a freeform array (e.g., ["friendly", "quirky", "confident"]).
The AI generates these, but they're not standardized. Should we have a controlled vocabulary?

→ Your response:

These are ok. I have no problem with this, but if traits/tags are added, perhaps there should be a deeper system in place. This is something that can be iterated.

---

### Q2.9: How do we handle brand evolution?
A brand's personality can shift. Are we fingerprinting "current state" or "core identity"? Should older videos be downweighted?

→ Your response:

I think brand personality should be calculated at the time of the fingerprint creation. If the user wants to append data, he/she can interact with the profile analysis tool once again.

---

### Q2.10: What's the relationship between personality and performance?
If a brand is warm but their warm content underperforms vs. their edgy content—which defines them?

→ Your response:

I don't think this is an important off-case. One is assuming that the profile using this service will find it easy to go one way or the other, wishing or asking the brand profile to track changes in intention, which perhaps adds another dimenson to the fingerprint (desire vs current).

---

## Layer 3: Production DNA

This layer captures visual/audio execution style—production investment, effort, format consistency.

### Q3.1: Is production style actually differentiating?
Many TikToks share similar iPhone-shot, natural-light, talking-head formats. Does L3 add signal or just noise?

→ Your response:

The layer would mainly show how the perception would be for any user. A small brand, going for good production is seen to be striving or putting emphasis on good perception, although that is not a guarantee that better "value" is perceived. A restaurant with a nice backdrop, or a known brand, would do well to have good production in order to not be perceived as lazy. This is why bigger brands, who take external help, will normally have a more cohesive and good looking flow and robust production across the content.

In the context of the service, the production would represent the relative attunement for business purposes. Many brands use iPhone camera, especially for brands that play into the main Tiktok "Sound" trends - simple structures that rely on music clips that are dubbed. L3 should for this reason not be used as a "ranker", saying that good production is always better, or worse production is always worse. But in general, I would say that bad audio, bad (sloppy) editing, non-symmetrical or otherwise unplanned shots, unfocused lighting is generally associated with a "let's just wing it" attitude. The smaller brands that aim for something better, despite not putting too much emphasis on excellent video quality or overall editing, are generally fine on a platform like TikTok.

---

### Q3.2: "Effortlessness" is a style choice, not a quality measure.
High-effort content made to look effortless is different from actually-low-effort content. Can the AI distinguish?

→ Your response:

I think the metric for high effort/low effort is very strange and speculative. Low skill/low effort cannot be distinguished unless trained on a lot of data. Some type of combination of business follower size (+ amount of content posted), and maybe some analysis of the business size/revenue based on video information, would give some indication in a company is "dabbling" in content or actually tries to understand and follow TikTok content creation norms/expectations.

---

### Q3.3: `has_repeatable_format` flags consistency.
Is format consistency a positive signal (brand recognition) or a negative one (boring/predictable)?

→ Your response:

This metric is also not useful, at least how I understand the phrasing. The replicability I have mentionen earlier has to do with how much setup, or expected skill is needed to pull the concept off.

Repeatable format doesn't mean anything. Any format can be repeated, if it isn't very focused in an inside joke or something that works for the profile. A metric describing "range" isn't bad or good, perhaps it's more of a categorization where the profile 'tends' to lean one way or the other. Especially when more subjective ratings, or an updated /analyze-rate function, have placed one type of content ahead of another, one could say that the profile "tends to go for simple, family friendly concepts", or profile "seems to follow the short form, Gen Z friendly sketch types" or a profile "tends to go for skits with absurdism, that try to be clever with visual humour".



---

### Q3.4: `social_permission` (how shareable is this content).
What makes content shareable vs. private? Is this about topic or presentation?

→ Your response:

This metric could have to do with safeness, or getting a very resonant feeling of "wow, this is so clever/absurd/chocking that I need to share with my friend". I think in general, sharing is usually done when there is a chock factor, or a "red pill" idea or concept shared. Between friends (Girl friends or guy friends), this is what I've noticed garners sharing. When it comes to food or sharing food tips, it will come down to nicely presented visuals, or that the food seems attractive.

---

### Q3.5: Should L3 capture platform-specific conventions?
TikTok vs Instagram vs YouTube styles differ. Is a "good TikTok" approach applicable to Instagram?

→ Your response:

You are right that they may not be. TikTok has another audience and overall tone, playing more on entertainment that is accessible for teenagers, rather than Instagram that attracts young adults. Instagram has more to do with overall informative, well produced content, while TikTok does more personalized or playful/entertaining content.

How this is taken into account may be a goal for a later date. The current model is focused on

-Service businesses (may open up for other types of businesses, but not accounted for in any way)
-TikTok (may open up for Instagram/Youtube, but not accounted for in any way)
-Humor as the main service provided (vetted viral concepts catered to specific profiles)

---

### Q3.6: Audio is minimally captured (music/voice tone).
For hospitality content, does audio matter? Background music, ASMR food sounds, voiceover style?

→ Your response:

In general, audio can be established to frame the type of content being produced. I have mentioned a few times how content relying on "TikTok sounds" - meaning trending theme sounds that are played in the video, may signal a piece of content that may not be the most useful for the platform.

-Trend sounds are usually matched with a text overlay holding the premise. While not bad, it sometimes is related to short, punchy and high impact concepts rather than a bit more creative, longer, script/editing based concepts.
-It's more trend reliant, meaning that it loses relevance after a few weeks/months.

The content you mention may not be bad to take into consideration, especially for the profile brand fingerprint. The idea is to get a sense of the profiles overall input, meaning that it would be unwise to use the same models to analyze profiles that we use for the service in question. The models within the service focus on humour, while many target audience profiles may combine humour with other types of videos.

Extending our system to recognize and allow other types of content may be good, but seems like it would extend the logic of our system for something that isn't the most important right now. Later, this would give a more accurate view.

---

### Q3.7: We don't capture visual branding (colors, logos, graphics).
Some brands have strong visual identity. Others are just raw footage. Should we track this?

→ Your response:

I think thumbnails and overall production/editing skill/output should be used for this. A strong visual identity, or at least a steadyness, could be used to hold some weight in figuring out a brands effectiveness or ambition. This is good to store somehow in our profile fingerprint.

---

## Aggregation & Computation

How signals combine across videos into a fingerprint.

### Q4.1: Simple averaging loses information.
If brand has 50% "witty" humor and 50% "wholesome"—we report both as dominant. But are they alternating, experimenting, or inconsistent?

→ Your response:

It's just different expressions of their voice. If I have a brand catering towards teenagers, the content will take different forms but reasonably be what the target appreciated. Witty humour and wholesomeness doesn't work as oppositions, it's possible to be witty and wholesome. Other's are dry and edgy. Ultimately, inconsistency would be to try any type of clip, with any type of voice, without any focus or reason. This would be the same as a person not having defined preferences in their words or actions.

Generally, one would have to assume that a brand has some type of intentionality if they are seeking to improve it using the service, and in the service, the brand profile blueprint system to get a mirror showing themselves.

---

### Q4.2: Mode selection for categories can be fragile.
With 10 videos and 4 "entertain", 3 "inform", 3 "inspire" intents—we pick "entertain." But is 40% really "dominant"?

→ Your response:

This type of question is too narrow. The overall input that is provided may contain the assumption that it represents the overall mix. With some smart understanding assumed, where 3 videos cannot reasonably represent everything 100%, but 15 may. If the model automatically takes the 15 most recent videos, this can also be assumed to be representative, but maybe not as representative as if a user actually pasted in 15 clips that they assert represent their brand personality/output.

Within the service, for our current models, we are assuming that the brand have an intention of filling up their content with humour concepts that positively add to their mix, where they decide how often or how much they want to upload. If the brand has four videos for entertainment, and six for other things, this is the users perogative. The brand can be described to have a mix but the discussion is how it related to what we offer. Meaning that the analysis, while good to actually capture neutrally what the profile does, will still make the discussion about their identity relating to humor.

---

### Q4.3: Video weights (quality × coherence) bias toward "good" content.
Should exceptional outliers be weighted higher, or does this bias the fingerprint away from the brand's typical output?

→ Your response:

The overall understanding would be that the lower quality videos would show more clear signals of the baseline, where good production or clever ideas are what happens when the user is focused. The only thing one can do is to track the overall. For the service's purpose, this would just give an idea of how to position recommendations that feels good (either mid-range good or high-range good in relation to their middle) when using the service. In describing the brand to the user, one could lean towards positive descriptions or at least "striving" descriptions, where the good is the baseline and the less good is mentioned less.

---

### Q4.4: The embedding centroid is a single 1536-dim vector.
This compresses all semantic nuance into one point. Two very different videos could average to a centroid that resembles neither. Is this a problem?

→ Your response:

I'm open to suggestions.

---

### Q4.5: Confidence score is just data completeness, not accuracy.
Having 100% of videos rated doesn't mean ratings are accurate. How should we differentiate "lots of data" from "reliable data"?

→ Your response:

Some variables in play are subjective. If I view a profile, I would like the model to

-Describe the profile and the business behind it. The business would only show glimpses that can be alluded to, where the content also contains signals that feed into underlying assumptions. Just as a person can have an overall energy, many things are read between the lines. If the model works as wished, the data input will be able to form a cohesive idea of the brand, their ambition, their current working processes, the personality of the content resonsible party, the comedic skill, the social media skill etc. All of this creates a profile.

If the data collection makes this type of declaration inaccurate, I would signal a lack of depth or a perspective that looks unhelpful values.

---

### Q4.6: How many videos are actually needed?
Documentation says 5-10. But some brands are consistent (3 might suffice), others are varied (might need 20). How do we know?

→ Your response:

If one finds a way of analyzing the cohesiveness of the content, meaning everything from production, thumbnails, content themes and more, then this may be a good way of discerning 'when' understanding has been established. Three videos may very well be outliers, which would skew the learning. But if those three were analyzed, and also compared to the thumbnail quality or similar views as previous 5, then that could contain meaning.

---

## Matching & Comparison

How we use fingerprints to find similar content or evaluate fit.

### Q5.1: Current match weights: L2 (35%) > Embedding (30%) > L1 (25%) > L3 (10%)
Do these reflect importance correctly? Why is L3 so low if production style matters?

→ Your response:

This entire balance would have to be destroyed and reinterpreted to get at the main cluster or heart of the matter. The purpose of this question document is to get an understanding of how the moving parts relate to each others, and which edge-cases make a different structure relevant.

Fingerprints aim to match content and describe profiles. It is meant to create reliability in recommendations to keep refunds down. The balance also takes into account the fact that production quality, in input videos, will not be so important since the videos are meant to be replicated.

One would have to integrate reasonings to why certain aspects of layers matter, but also put it in a context prioritizing usefulness.

L3 production value doesn't strictly matter for video-recommendation analysis, when later presented for a service user. It is somewhat important if a big, social media-investing brand purchases a concept that has low production quality. The example video - "this is the video to replicate", would give a feeling of being beneath them, even if the core concept is strong in itself.

For brand-profile fingerprinting, production value 'is' important in grading the businesses' relative investment into social media production, describing the self perception and their strivingness. High strivingness means that the business aims to be competing - showing strong traits and wanting to impress. This is relevant information for recommendation as well.

---

### Q5.2: L1 match penalizes quality differences.
If a 0.9-quality brand matches against a 0.7-quality candidate, they're penalized. But maybe the style matches perfectly?

→ Your response:

This is why my understanding of L1 may be incomplete. I have mentioned previously what differentiates the gradiations. For what it's worth, I have no issue with revamping the grading system for /analyze-rate.

---

### Q5.3: L2 match uses humor overlap heavily (30%).
Non-humorous brands get a 0 here, hurting their match scores. Is this fair?

→ Your response:

The videos analyzed in order to match with users will have the same assumption as ground. It is meant to be a humorous video that can fit well with the profile type. If a brand does not intend on using humor/entertainment, the service is not for them.

---

### Q5.4: Embedding similarity is cosine on the centroid.
This treats all 1536 dimensions equally. Some might be noise. Should we reduce dimensionality or weight dimensions?

→ Your response:

I'm open to suggestions.

---

### Q5.5: What's the minimum threshold for a "useful" match?
Currently 0.85 is "good." But is 0.70 still valuable? At what point is a match misleading?

→ Your response:

Some of these values, if reliable, may be used to weight many concepts and rank them on their relative use towards a brand profile. A 0.7 can be purchased, but may not be recommended before a 0.85.

---

### Q5.6: Should we match fingerprint-to-fingerprint, or fingerprint-to-video?
A brand fingerprint compared to a single video is asymmetric. How should we handle this?

→ Your response:

It is true. Thinking about it, one could even analyze the entire profile of the video content uploaded, instead of relying only on variables found in the video. This sounds operation-heavy, but could be a way to get even more accuracy.

My understanding is that a video may have a so called fingerprint. Unless I'm mistaken, there is possibility to match

- Video to video
- Video to profile
- Profile to profile

But I'm open to suggestions.

---

## Data Sources & Ground Truth

The fundamental inputs that everything depends on.

### Q6.1: Human ratings are sparse.
How many of your 4 test brands' videos have been manually rated? Is the system flying blind?

→ Your response:

These videos have been rated with a legacy rating system that takes 5 + 1 subjective rating variables as well as notes that describe how useful they are for the service at hand. Some of these videos are also rated with a system developed later, with four gradations (excellent, good, mediocre, bad), as well as three note fields that focus the usefulness analysis even more. They have been manually rated.

The data-model for each video is still available for modification. It seems to work, but it 'is' blind since it is the first step, and not iterated many times.

---

### Q6.2: Schema v1 requires GCS upload for video analysis.
Is every video being analyzed, or are some missing? How reliable is the AI analysis without corrections?

→ Your response:

/analyze-rate and Schema v1 both analyze and use GCS upload. If they are using the same core video upload, I'm not sure. Perhaps one can control this and make efficient.

Saying corrections, I'm assuming that:

-Overall analysis will improve with new schema iterations
-Overall analysis of separate videos/profiles will be overridden if re-analyzed
-Overall strength of analysis will improve with amount of datapoints, both profiles and videos.

---

### Q6.3: Corrections/overrides are rarely populated.
The system has a `human_patch` mechanism but it seems unused. Is the AI output being trusted blindly?

→ Your response:

I'm not sure what this mechanism entails. But I have mentioned once or twice that human input, in the form of notes, may be a useful way of shaping the model in this stage.

---

### Q6.4: There's no feedback loop on matches.
We can't currently record "this match was good/bad" to tune the system. How critical is this?

→ Your response:

This can be implemented, but the core analysis function needs to be good before a broader data collection or comparison view becomes crucial. Bad/good, or a slider for a spann, with notes possible, would give a lot of information that can be used to tune the algorithm we are attempting to form.

---

### Q6.5: Embeddings are generated by OpenAI's model.
These aren't hospitality-specific. A "cozy café" might be similar to "cozy living room" in embedding space. Is this a problem?

→ Your response:

When it comes to OpenAI embeddings, I am completely fine with leaving that structure and revamping  the embedding system in another system. I think anything that aligns with our goals is good. I don't mind OpenAI embeddings.

Focused suggestions here is invited.

---

## Test Case Calibration

For your 4 test brands (Cassa Kitchen, Kiele Kassidy, Steve's Poke, Bram's Burgers):

### Q7.1: What should the ideal fingerprint capture for each?
In 2-3 sentences, describe what makes each brand distinctive. This is your ground truth.

#Note - "I'll give a different answer, that doesn't answer directly what makes each distinctive"

**Cassa Kitchen**: 
→ Your response:

Cassa's kitchen seems to be a chain-type establishment, that utilize teenager staff to play out friendly and generally amusing themes. The target audience seems to be somewhat broad, and the themes play on somewhat loaded emotional themes relating to work-place environments. The concepts are short and simple, following trends but not relying to much on meme-formats. Not very "edgy".

**Kiele Kassidy**: 
→ Your response:

This looks like a personal brand set in a restaurant. The main character is a server in a restaurant, that uses simple trend-relying themes/sounds to play out a scenario, often presented in text on the screen. The humor feels effortless, as if the character finds inspiration on the app and records her favorites. Overall a bit edgier, which is on brand for a young creator that plays on social dynamics/workplace dynamics to engage a target audience that is assumed to be young women. Many inside jokes or assumptions that the audience gets, or finds interest in, scenarios in the workplace.

**Steve's Poke**: 
→ Your response:

A sketch heavy profile that seems to package the restaurant as a friendly and family-oriented poké shop. The content relies on fun sketches, featuring kids, teenagers and the main characters. Steve, the owner, plays a loving but simple man (like Homer Simpson), and the sketches seem to just make light jokes about how humans relate to food, life, friends etc. Some pun-based sketches, some wholesome and family-friendly sketches etc. Overall unfocused production. It seems to be produced by the team itself.

**Bram's Burgers**: 
→ Your response:

Seems like a young team running a newly started burger franschise. The tone is professional but inviting, with darker color schemes and focus on rapid and flashy editing. The sketches are not absurdist exactly, which works in relation to the theme it conveys - coolness, youth, attitude but inviting at the same time. 

---

### Q7.2: Which pairs should be "similar" and which should be "different"?
Draw the expected similarity matrix:

|  | Cassa | Kiele | Steve's | Bram's |
|--|-------|-------|---------|--------|
| Cassa | - | ? | ? | ? |
| Kiele | ? | - | ? | ? |
| Steve's | ? | ? | - | ? |
| Bram's | ? | ? | ? | - |

→ Your response:

All are distinctive. Most like would be Cassa and Steves, who have a family oriented profile that relies on humorous/entertaining/absurdist themes. They both have similar production value.

Kiele's humor is more Gen Z focused, aiming to relate and resonate with youth that generally like impactful and dramatic themes, but presented in a nonchalant way. It isn't exactly family-oriented, more the dynamics of a young adult in a worldly setting, expecting a lot from the character. The content doesn't either build relation to the brand, rather its a personal brand set in a restaurant setting.

Bram's creates a tone where the restaurant is treated like a friendly local burger spot with a cool packaging. The humour is about friendly confrontation, having people respect each other while showing their attitude and willingness to signal groundedness and ability.

---

### Q7.3: What would a "false positive" look like for each brand?
What kind of content would the system incorrectly flag as a match?

→ Your response:

Types of humor. In general, the humor that have simple conversational disagreements or expected twists and turns are generally less advanced in their setup. This would be humor that could be more broadly accessible, but not assume too much from the viewer (like a blockbuster movie - available to many but not saying anything). Another step would be humor with absurdist or "unreal" feelings, that expects more from the viewer but may also have a satisfying payoff. Another step would be creative, clever scripts, with an implied punchline or otherwise satisfying twists.

Just as a person can be "simple", not wanting too much flavor or spice in their every day life, the same can be said about humor. It's useful to assume here that TikTok invites all kinds of people, but that the culture is centered around 15-25 year old having a want for dumb, creative or unexpected content.

This answer may not be clear for the question posed.

---

### Q7.4: What would a "false negative" look like?
What content fits the brand perfectly but the system might miss?

→ Your response:

I can't find a helpful response.

---

### Q7.5: If you had to pick ONE signal that best differentiates these 4 brands, what would it be?
(This helps prioritize what the system must get right)

→ Your response:

The target audience/overall directedness of themes/voice. They differ in who they are targeting, and form their message to be relatable. Steve's - families and people who want simple enjoyment, Cassa's - adults and likely families, Kiele - Likely young people who seek entertainment and emotional stimulation, Brams - People who enjoy social environents that combine food and friend group hangouts.

---

## Next Steps

After you complete this questionnaire:

1. **I will analyze patterns in your answers** to identify which layers need refinement
2. **We'll create ground truth annotations** for the test videos
3. **Build an accuracy test harness** that compares system output to your expectations
4. **Iterate on weights/signals** until we hit 90% alignment

---

*Document created: December 13, 2025*
*Last updated: —*
