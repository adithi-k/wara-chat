// src/App.js
import React, { useState } from 'react';
import axios from 'axios';

// Create an axios instance with the base URL of your deployed backend
const api = axios.create({
  baseURL: 'https://aara-backend-aries.azurewebsites.net'
});

const App = () => {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const sendMessage = async () => {
    if (input.trim() === '') return;

    const userMessage = { role: 'user', content: input };
    setMessages([...messages, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      const response = await api.post('/api/chat', {
        messages: [...messages, userMessage],
      }, {
        headers: {
          'Content-Type': 'application/json',
        },
      });

      const assistantMessage = response.data.choices[0].message;
      setMessages((prevMessages) => [...prevMessages, assistantMessage]);
    } catch (error) {
      console.error('Error sending message:', error);
      setMessages((prevMessages) => [
        ...prevMessages,
        { role: 'system', content: 'An error occurred. Please try again.' },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="container mx-auto p-4 max-w-2xl">
      <h1 className="text-3xl font-bold mb-6 text-center">OpenAI Chat App</h1>
      <div className="bg-gray-100 p-4 h-96 overflow-y-auto mb-4 rounded-lg shadow">
        {messages.map((message, index) => (
          <div
            key={index}
            className={`mb-4 ${
              message.role === 'user' ? 'text-right' : 'text-left'
            }`}
          >
            <span
              className={`inline-block p-3 rounded-lg ${
                message.role === 'user'
                  ? 'bg-blue-500 text-white'
                  : 'bg-white text-gray-800'
              } shadow`}
            >
              {message.content}
            </span>
          </div>
        ))}
        {isLoading && (
          <div className="text-center">
            <span className="inline-block p-2 bg-gray-200 rounded-lg animate-pulse">
              Thinking...
            </span>
          </div>
        )}
      </div>
      <div className="flex">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyPress={(e) => e.key === 'Enter' && sendMessage()}
          className="flex-grow border p-3 rounded-l-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="Type your message..."
        />
        <button
          onClick={sendMessage}
          className="bg-blue-500 text-white p-3 rounded-r-lg hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
          disabled={isLoading}
        >
          Send
        </button>
      </div>
    </div>
  );
};

export default App;
