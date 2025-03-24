const { OpenAI } = require('openai');

class AIService {
  constructor(apiKey) {
    this.openai = new OpenAI({
      apiKey: apiKey
    });
    
    // Base system prompt for the DAO assistant
    this.baseSystemPrompt = `You are Alphin, an AI assistant for a DAO (Decentralized Autonomous Organization) on Telegram.
Your primary role is to help users participate in DAO governance through a user-friendly interface.

Key facts about the Alphin DAO:
- Users can join the DAO, create proposals, and vote on proposals
- All blockchain interactions are handled by the bot (users don't need to pay gas fees)
- Each user gets their own wallet managed by the bot and secured with a PIN
- Tokens are used for governance (voting on proposals)
- Users earn tokens by participating (voting, creating proposals)

FORMATTING GUIDELINES:
- Format your responses using Telegram's Markdown:
  * Use *asterisks* for bold text
  * Use _underscores_ for italic text
  * Use \`backticks\` for inline code
  * Do NOT use # for headings as Telegram doesn't support them
- When using special characters like !, ., (, ), etc., do NOT escape them with backslashes
- Special characters are handled automatically by the system - focus on the content
- Use emojis liberally to make your responses engaging and friendly (💰 for tokens, 🗳️ for voting, 📝 for proposals, etc.)
- Structure your responses with clear sections and bullet points
- Keep responses concise but friendly

When users ask about technical blockchain details, explain in simple terms with analogies.
For specific actions like joining, voting, or creating proposals, direct users to use the bot's menu commands or buttons.`;
  }
  
  /**
   * Process a message and generate a response
   * @param {string} userMessage - The user's message
   * @returns {Promise<string>} - The AI-generated response
   */
  async processMessage(userMessage) {
    try {
      const response = await this.openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          { role: "system", content: this.baseSystemPrompt },
          { role: "user", content: userMessage }
        ],
        max_tokens: 500
      });
      
      return response.choices[0].message.content;
    } catch (error) {
      console.error('Error calling OpenAI API:', error);
      return "I'm having trouble processing that right now. Please try again later.";
    }
  }
  
  /**
   * Generate specific help for DAO topics
   * @param {string} topic - The help topic requested
   * @returns {Promise<string>} - The AI-generated help text
   */
  async generateDAOHelp(topic) {
    const helpPrompt = `${this.baseSystemPrompt}
    
A user is asking for help with the topic: "${topic}". Provide a clear, helpful explanation about Alphin DAO that would be valuable for someone using your DAO assistant.

Remember to:
- Use appropriate emojis that match the topic
- Format important points in *bold*
- Keep information easy to understand for non-technical users
- Structure your response with clear sections and bullet points
- Conclude with a call to action when appropriate

Focus on practical guidance and keep the response reasonably brief.`;
    
    try {
      const response = await this.openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          { role: "system", content: helpPrompt }
        ],
        max_tokens: 800
      });
      
      return response.choices[0].message.content;
    } catch (error) {
      console.error('Error calling OpenAI API for help:', error);
      return "I'm having trouble generating help content right now. Please try again later.";
    }
  }
  
  /**
   * Process a group mention and generate a response
   * @param {string} groupMessage - The message from the group chat
   * @param {string} groupContext - Additional context about the group/DAO
   * @returns {Promise<string>} - The AI-generated response for the group
   */
  async processGroupMention(groupMessage, groupContext) {
    const groupPrompt = `${this.baseSystemPrompt}
    
You've been mentioned in a group chat for the Alphin DAO. Here's some context about the DAO:
${groupContext}

The message is: "${groupMessage}"

Provide a helpful, concise response appropriate for a group chat. Keep your answer brief and focused on the question asked.

Because this is a group chat:
- Keep your response shorter than in private chats
- Use emojis to make your response stand out and feel friendly
- Format key points in *bold* 
- Do NOT escape special characters with backslashes
- If appropriate, encourage users to interact with you in private chat for more complex tasks
- Always maintain a friendly, community-oriented tone`;
    
    console.log(`[DEBUG] AIService: Processing group mention with message: "${groupMessage}"`);
    
    try {
      console.log(`[DEBUG] AIService: Calling OpenAI API for group mention`);
      const response = await this.openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          { role: "system", content: groupPrompt }
        ],
        max_tokens: 300 // Keep responses shorter in groups
      });
      
      console.log(`[DEBUG] AIService: OpenAI API response received`);
      console.log(`[DEBUG] AIService: Response status: ${response?.choices?.[0]?.finish_reason || 'unknown'}`);
      
      return response.choices[0].message.content;
    } catch (error) {
      console.error('[DEBUG] AIService: Error calling OpenAI API for group mention:', error);
      return "I'm having trouble processing that right now. Please try again later.";
    }
  }
}

module.exports = AIService;
