### 1. What problem are you solving?

Communication between Shopee buyers and sellers is still largely asynchronous. Buyers often wait hours, sometimes days, for answers about product details, sizing, comparisons, availability, vouchers, or return policies. Many of them give up and buy elsewhere.
On the seller side, most shops are small businesses that cannot staff customer support 24/7. They answer the same questions over and over, and the problem peaks at night and during mega-sale campaigns such as 9.9 or 11.11, exactly when demand is highest.
Text-based chatbots reduce waiting time, but they don't fully solve the problem. Shopee is overwhelmingly used on mobile, where typing long questions is slow, especially in Vietnamese with diacritics. Shopping questions are also naturally conversational: buyers compare items, change their minds, and ask follow-ups like "what about the black one?" The popularity of Shopee Live shows that buyers value real-time, human-like interaction with sellers. What's missing is a way to get that experience any time, from any shop, without a human on the other end.

### 2. Who is the target user?

Our product serves both sides of the marketplace.
Buyers: mobile-first Shopee shoppers who want fast, natural answers while browsing, comparing, purchasing, or handling post-purchase issues. This especially includes users who find typing inconvenient, such as older buyers or people shopping on the go.
Sellers: small and medium-sized shops with high volumes of repetitive questions. Our initial focus is on categories where buyers ask many detailed questions before purchasing, such as electronics, beauty, and fashion.
Example personas:
Lan, 45, shops for household appliances in the evening and prefers asking questions out loud rather than typing.
Minh, runs a phone accessories shop with two staff members and receives ~200 messages a day, most of them about compatibility, stock, and shipping.
Sellers are the ones who enable and configure the assistant. Buyers are the end users. For sellers, the value is clear: more questions answered instantly, fewer lost sales, and less time spent on repetitive support.

### 3. What will you build?

We will build a real-time voice shopping assistant for Shopee stores. It lets buyers talk naturally with a virtual shop assistant that knows the shop's products, stock, vouchers, and policies.
Core capabilities:
Find and compare products by voice, with live product cards.
Answer questions about specifications, variants, availability, vouchers, and shipping.
Explain return and refund policies and guide buyers through the process step by step.
Recommend relevant products based on the buyer's needs.
Support natural Vietnamese conversation, including follow-up questions and interruptions.
Smart handoff to the seller when a question is outside verified data or needs seller approval
Simulated Shopee environment. Shopee does not currently allow third-party features to be embedded directly in its app. For the hackathon, we will therefore build a simulated Shopee environment that replicates key shopping flows: shop pages, product listings with variants and stock, vouchers, reviews, and return/refund policies. We will populate it with realistic data for several shops across different categories. This shows that the assistant generalizes beyond a single store.
Architecture. The assistant runs on the OpenAI Realtime API for speech-to-speech interaction. It accesses shop data through a layer of tools via function calling, such as search_products, compare_products, get_product_details, get_return_policy, and get_order_status. In the demo, these tools read from mock data structured after the Shopee Open Platform schema. In production, they can be connected to the real Shopee Open Platform API without changing the assistant's core logic.
Reliability and safety. In e-commerce, a wrong answer about price or policy is worse than no answer. The assistant will:
Answer only from verified shop data. It will not invent prices, promotions, or policies.
Say clearly when it doesn't know, and offer to hand off to the seller.
Avoid making commitments the seller hasn't approved, such as extra discounts or exceptions to policy.
Seller controls. Sellers get a simple dashboard to configure the assistant's tone and voice, add custom FAQs, and review conversation logs. This helps them improve their listings and spot common buyer concerns.
Seller dashboard and customer insights. Every conversation with the assistant is a direct signal of what buyers want. Today, sellers mostly lose that signal in scattered chat messages. The seller dashboard turns these conversations into actionable insights:
Demand and product insights. Surface the products buyers ask about most, features or variants they request that the shop doesn't carry (e.g., "do you have this in size XL?", "is there a version with USB-C?"), and common reasons buyers hesitate or don't buy. Sellers can use this to adjust their product mix, restock popular variants, or add new items.
Listing improvements. Detect questions that come up repeatedly because product descriptions are unclear or incomplete, such as sizing, compatibility, or materials. Then suggest specific edits to listings so buyers find answers faster.
Assistant tuning. Highlight conversations where the assistant couldn't answer, handed off to the seller, or where buyers seemed dissatisfied. Sellers can then add FAQs, refine policies, or adjust the assistant's tone, voice, and recommendation behavior to communicate better with their customers.
Trends over time. Track how buyer questions and sentiment change across campaigns, seasons, and new product launches.
This creates a feedback loop: the assistant answers buyers, the conversations generate insights, and sellers use those insights to improve both their products and the assistant.
Note: The simulated environment is built for demonstration purposes only and is not an official Shopee product.


### 4. How will you use Codex?

We will use Codex as an engineering agent throughout the hackathon, with clearly defined responsibilities:
Feature implementation. Codex will build the Shopee-style mock platform (shop pages, product catalog, cart, order flows) and the tool layer that the voice assistant calls, including tool schemas for function calling.
Data generation. Codex will generate realistic mock shop data across multiple categories: products, variants, reviews, vouchers, and policies.
Testing and evaluation. Codex will write unit tests for the tool layer and build an evaluation harness. The harness runs a set of shopping questions against the assistant to check answer accuracy and catch hallucinated prices or policies.
Parallel development. We will run multiple Codex tasks in parallel for independent modules (frontend, tool layer, seller dashboard, evals). An AGENTS.md file will keep Codex aligned with our repo conventions.
Code review in CI/CD. Codex will review every pull request on GitHub before merge, flagging bugs and inconsistencies so the team can move fast without sacrificing quality.
For the product itself, we will use the OpenAI Realtime API. It handles speech-to-speech natively instead of chaining separate speech-to-text, LLM, and text-to-speech steps, which is what makes low-latency, natural conversation possible. Function calling within the Realtime API lets the assistant look up live shop data mid-conversation.



