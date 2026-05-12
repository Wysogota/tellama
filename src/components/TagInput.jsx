import React, { useState, useRef, useEffect } from 'react';
import { X } from 'lucide-react';

const TagInput = ({ tags, onTagsChange, availableTags, placeholder, label }) => {
  const [inputValue, setInputValue] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const inputRef = useRef(null);
  const containerRef = useRef(null);

  // Filter available tags that are not already selected and match input
  const suggestions = availableTags.filter(
    tag => 
      tag.toLowerCase().includes(inputValue.toLowerCase()) && 
      !tags.includes(tag)
  );

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addTag(inputValue);
    } else if (e.key === 'Backspace' && !inputValue && tags.length > 0) {
      removeTag(tags[tags.length - 1]);
    }
  };

  const addTag = (tagText) => {
    const trimmed = tagText.trim();
    if (trimmed && !tags.includes(trimmed)) {
      onTagsChange([...tags, trimmed]);
    }
    setInputValue('');
    setShowSuggestions(false);
  };

  const removeTag = (tagToRemove) => {
    onTagsChange(tags.filter(tag => tag !== tagToRemove));
  };

  return (
    <div className="mb-4" ref={containerRef}>
      <label className="block text-sm font-medium text-[var(--tg-hint-color)] mb-1">{label}</label>
      <div 
        className="min-h-[42px] p-2 w-full bg-[var(--tg-search-bg)] rounded-xl flex flex-wrap gap-1.5 transition-all duration-200 focus-within:bg-[var(--tg-search-bg-focused)] focus-within:shadow-sm border-none cursor-text relative"
        onClick={() => inputRef.current?.focus()}
      >
        {tags.map((tag, index) => (
          <span 
            key={index} 
            className="flex items-center gap-1 bg-[var(--tg-button-color)] text-white px-2 py-0.5 rounded-md text-sm"
          >
            {tag}
            <X 
              size={14} 
              className="cursor-pointer hover:text-white/70" 
              onClick={(e) => {
                e.stopPropagation();
                removeTag(tag);
              }}
            />
          </span>
        ))}
        <input
          ref={inputRef}
          type="text"
          value={inputValue}
          onChange={(e) => {
            setInputValue(e.target.value);
            setShowSuggestions(true);
          }}
          onKeyDown={handleKeyDown}
          onFocus={() => setShowSuggestions(true)}
          placeholder={tags.length === 0 ? placeholder : ''}
          className="flex-grow bg-transparent outline-none min-w-[120px] px-1 text-[var(--tg-text-color)] text-sm"
        />

        {showSuggestions && (inputValue || suggestions.length > 0) && (
          <div className="absolute top-full left-0 right-0 mt-1 bg-[var(--tg-bg-color)] border border-[var(--tg-border-color)] rounded-lg shadow-lg z-50 max-h-40 overflow-y-auto">
            {suggestions.length > 0 ? (
              suggestions.map((tag, idx) => (
                <div 
                  key={idx}
                  className="px-3 py-2 hover:bg-[var(--tg-secondary-bg-color)] cursor-pointer text-sm"
                  onClick={() => addTag(tag)}
                >
                  {tag}
                </div>
              ))
            ) : inputValue ? (
              <div 
                className="px-3 py-2 hover:bg-[var(--tg-secondary-bg-color)] cursor-pointer text-sm text-[var(--tg-link-color)]"
                onClick={() => addTag(inputValue)}
              >
                Add "{inputValue}"
              </div>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
};

export default TagInput;
