const { OpenAI } = require('openai');
const basePrompt = require('../prompts/basePrompt');

class AIService {
  constructor(apiKey, formatPrompt, ContextPrompt) {
    this.openai = new OpenAI({
      apiKey: apiKey
    });
    this.formatPrompt = formatPrompt;
    this.ContextPrompt = ContextPrompt;
  }

  /**
   * Combine base prompt with format and project-specific prompts
   * @returns {string} - Combined prompt
   */
  getCombinedPrompt() {
    return `${basePrompt}\n\n${telegramFormatPrompt}\n\n${alphinDAOPrompt}`;
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
          { role: "system", content: this.getCombinedPrompt() },
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
    const helpPrompt = `${this.getCombinedPrompt()}
    
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
    const groupPrompt = `${this.getCombinedPrompt()}
    
You've been mentioned in a group chat for the Alphin DAO. Here's some context about the DAO:
${groupContext}

The message is: "${groupMessage}"

Provide a helpful, concise response appropriate for a group chat. Keep your answer brief and focused on the question asked.

Because this is a group chat:
- Keep your response shorter than in private chats
- Use emojis to make your response stand out and feel friendly
- Format key points in *bold* 
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
