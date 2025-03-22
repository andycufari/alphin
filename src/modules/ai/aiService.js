const { OpenAI } = require('openai');

class AIService {
  constructor(apiKey) {
    this.openai = new OpenAI({
      apiKey: apiKey
    });
    
    // Base system prompt for the DAO assistant
    this.baseSystemPrompt = `You are Alfin, an AI assistant for a DAO (Decentralized Autonomous Organization) on Telegram.
Your primary role is to help users participate in DAO governance through a user-friendly interface.

Key facts about the DAO:
- Users can join the DAO, create proposals, and vote on proposals
- All blockchain interactions are handled by the bot (users don't need to pay gas fees)
- Each user gets their own wallet managed by the bot and secured with a PIN
- Tokens are used for governance (voting on proposals)
- Users earn tokens by participating (voting, creating proposals)

Be helpful, concise, and informative. If users ask about technical blockchain details, explain in simple terms.
For specific actions like joining, voting, or creating proposals, encourage them to use the menu commands rather than trying to handle it conversationally.`;
  }
  
  /**
   * Process a message and generate a response
   * @param {string} userMessage - The user's message
   * @returns {Promise<string>} - The AI-generated response
   */
  async processMessage(userMessage) {
    try {
      const response = await this.openai.chat.completions.create({
        model: "gpt-4",
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
    
A user is asking for help with the topic: "${topic}". Provide a clear, helpful explanation that would be valuable for someone using your DAO assistant. Focus on practical guidance and keep the response reasonably brief.`;
    
    try {
      const response = await this.openai.chat.completions.create({
        model: "gpt-4",
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
    
You've been mentioned in a group chat for the DAO. Here's some context about the DAO:
${groupContext}

The message is: "${groupMessage}"

Provide a helpful, concise response appropriate for a group chat. Keep your answer brief and focused on the question asked.`;
    
    try {
      const response = await this.openai.chat.completions.create({
        model: "gpt-4",
        messages: [
          { role: "system", content: groupPrompt }
        ],
        max_tokens: 300 // Keep responses shorter in groups
      });
      
      return response.choices[0].message.content;
    } catch (error) {
      console.error('Error calling OpenAI API for group mention:', error);
      return "I'm having trouble processing that right now. Please try again later.";
    }
  }
}

module.exports = AIService;
