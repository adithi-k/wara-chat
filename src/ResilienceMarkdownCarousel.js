import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { ProgressBar } from 'react-bootstrap';
import { Carousel} from 'react-bootstrap';
const ResilienceMarkdownCarousel = ({ children }) => {
  if (typeof children !== 'string') {
    console.warn('MarkdownCarousel: children prop is not a string');
    return null;
  }

  // Remove backticks if they're wrapping the entire content
  const cleanContent = children.trim().replace(/^`+([\s\S]*?)`+$/, '$1');

  const customSections = {};
  let score = 50;

  // Split the content into sections
  const sections = cleanContent.split('\\n').filter(section => section.trim() !== '');

  //lines with ### are considered as section headers and the lines after them are considered as the content of the section

    let currentSection = 'Resilience score';
    sections.forEach((line) => {
      if (line.includes('###')) {
        currentSection = line.replace('###', '').trim();
        customSections[currentSection] = [];
        if (line.includes('Resilience score')) {
            score = parseInt(line.split(':')[1].trim());
        }
      } else {
        // Add the line to the current section if it exists else add it to the default section
        if (!customSections[currentSection]) {
            customSections[currentSection] = [];
            }
        customSections[currentSection].push(line);
        
        if (line.includes('Resilience score')) {
            score = parseInt(line.split(':')[1].trim());
        }
      }
    });

  return (
    // customSections is an object with section headers as keys and an array of lines as values for each key. make the keys carousel header and the values the content of the carousel items
    <Carousel className="w-full max-w-xs">
        {Object.entries(customSections).map(([section, content], index) => (
          <Carousel.Item key={index} className="pl-1">
            <div className="p-1">
              <div className="flex aspect-square items-center justify-center p-6 bg-white rounded-md shadow">
                <h2>{section}</h2>
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  //rehypePlugins={[rehypeRaw]}
                  className="markdown-content"
                >
                  {content.join('\n')}
                </ReactMarkdown>        
                <ProgressBar now={score} label={`${score}%`}  variant={score > 80 ? 'success' : 'danger'}
                />
              </div>
            </div>
          </Carousel.Item>
        ))}
        </Carousel>

  );
};

export default ResilienceMarkdownCarousel;