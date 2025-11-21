# Sample Prompts for Testing Message Sending

Here are some sample prompts you can use to test the `sendMessage` tool, particularly around Cody:

## Basic Message Sending

1. **Simple message about Cody:**
   ```
   call the POST webhook with a message "who is cody on telegram"
   ```

2. **Alternative phrasing:**
   ```
   Send a message asking "who is cody on telegram"
   ```

3. **Direct command:**
   ```
   Send "who is cody on telegram" via Telegram
   ```

## Cody-Related Queries

4. **Find Cody's contact:**
   ```
   Send a message: "who is cody on telegram"
   ```

5. **Ask about Cody:**
   ```
   Call the webhook with message "find cody's telegram username"
   ```

6. **Search for Cody:**
   ```
   Send "look up cody in my telegram contacts"
   ```

7. **Get Cody's info:**
   ```
   Message: "what is cody's telegram handle"
   ```

## More Complex Scenarios

8. **Send message to Cody:**
   ```
   Send a message to Cody saying "hello, how are you?"
   ```

9. **Ask about Cody's details:**
   ```
   Send "who is cody and what's their telegram username"
   ```

10. **Find Cody:**
    ```
    Call the POST webhook with message "find cody on telegram"
    ```

## Testing Different Formats

11. **Without quotes:**
    ```
    Send who is cody on telegram
    ```

12. **With context:**
    ```
    I need to find Cody. Send a message asking "who is cody on telegram"
    ```

13. **Natural language:**
    ```
    Can you send a message to find out who Cody is on Telegram?
    ```

## Edge Cases

14. **Multiple questions:**
    ```
    Send "who is cody on telegram and discord"
    ```

15. **With punctuation:**
    ```
    Send message: "Who is Cody on Telegram?"
    ```

## Notes

- The tool will automatically use the correct webhook URL (`/webhook-test/paragonos-send-message` or `/webhook/paragonos-send-message`)
- If you don't specify a message, it will use the entire conversation history
- The payload is automatically formatted with the correct structure including `chatInput`, `stage`, `status`, `message`, and `streamUrl`

