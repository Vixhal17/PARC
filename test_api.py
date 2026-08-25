import os
import json
from dotenv import load_dotenv
from openai import OpenAI

def dummy_get_weather(location):
    """Returns the current weather in a given location."""
    return json.dumps({"location": location, "temperature": "72F", "condition": "Sunny"})

def main():
    load_dotenv()
    
    api_key = os.environ.get("NVIDIA_API_KEY")
    if not api_key:
        print("ERROR: NVIDIA_API_KEY not found in environment or .env file.")
        print("Please copy .env.example to .env and add your API key.")
        return

    client = OpenAI(
        base_url="https://integrate.api.nvidia.com/v1",
        api_key=api_key
    )
    
    model_name = "nvidia/nemotron-3-ultra-550b-a55b"
    
    tools = [
        {
            "type": "function",
            "function": {
                "name": "dummy_get_weather",
                "description": "Get the current weather in a given location",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "location": {
                            "type": "string",
                            "description": "The city and state, e.g. San Francisco, CA",
                        }
                    },
                    "required": ["location"],
                },
            }
        }
    ]

    messages = [
        {"role": "system", "content": "You are a helpful assistant. Use the supplied tools to answer the user's questions."},
        {"role": "user", "content": "What is the weather like in Seattle?"}
    ]

    try:
        print(f"Testing connection to {model_name}...")
        response = client.chat.completions.create(
            model=model_name,
            messages=messages,
            tools=tools,
            tool_choice="auto"
        )
        
        response_message = response.choices[0].message
        
        print("\nResponse Message:")
        print(response_message)
        
        if response_message.tool_calls:
            print("\nSUCCESS! The model successfully requested a tool call.")
            for tool_call in response_message.tool_calls:
                print(f"Tool call: {tool_call.function.name}")
                print(f"Arguments: {tool_call.function.arguments}")
        else:
            print("\nWARNING: The model responded, but did not make a tool call as expected.")
            print(f"Content: {response_message.content}")

    except Exception as e:
        print(f"\nAPI Error: {e}")

if __name__ == "__main__":
    main()
