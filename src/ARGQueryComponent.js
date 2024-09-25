import React, { useState, useEffect } from 'react';
import { Form, Button, Alert, Spinner, Pagination  } from 'react-bootstrap';

const API_URL = 'aara-backend-aries.azurewebsites.net';//'http://localhost:5000';

const ARGQueryComponent = () => {
  const [query, setQuery] = useState('Resources | project name, type, location');
  const [subscriptions, setSubscriptions] = useState('752d8fa4-2dcb-4750-81ac-c96998b622ae');
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);

  const indexOfLastItem = currentPage * itemsPerPage;
  const indexOfFirstItem = indexOfLastItem - itemsPerPage;
  const currentItems = results?.data?.slice(indexOfFirstItem, indexOfLastItem) || [];

  const totalPages = Math.ceil((results?.data?.length || 0) / itemsPerPage);

  const handlePageChange = (pageNumber) => setCurrentPage(pageNumber);

  const handleItemsPerPageChange = (e) => {
    setItemsPerPage(Number(e.target.value));
    setCurrentPage(1);
  };

  useEffect(() => {
    setCurrentPage(1);
  }, [results]);

  const renderPagination = () => {
    let items = [];
    for (let number = 1; number <= totalPages; number++) {
      items.push(
        <Pagination.Item key={number} active={number === currentPage} onClick={() => handlePageChange(number)}>
          {number}
        </Pagination.Item>,
      );
    }
    return (
      <Pagination>
        <Pagination.First onClick={() => handlePageChange(1)} disabled={currentPage === 1} />
        <Pagination.Prev onClick={() => handlePageChange(currentPage - 1)} disabled={currentPage === 1} />
        {items}
        <Pagination.Next onClick={() => handlePageChange(currentPage + 1)} disabled={currentPage === totalPages} />
        <Pagination.Last onClick={() => handlePageChange(totalPages)} disabled={currentPage === totalPages} />
      </Pagination>
    );
  };
  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setResults(null);

    try {
      const response = await fetch(`${API_URL}/execute-arg-query`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        },
        body: JSON.stringify({
          query,
          subscriptions: subscriptions.split(',').map(s => s.trim())
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to execute query');
      }

      const data = await response.json();
      setResults(data);
    } catch (err) {
      setError('Error executing query: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <h2>Azure Resource Graph Query</h2>
      <Form onSubmit={handleSubmit}>
        <Form.Group>
          <Form.Label>ARG Query</Form.Label>
          <Form.Control
            as="textarea"
            rows={3}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Enter your ARG query here"
            required
          />
        </Form.Group>
        <Form.Group>
          <Form.Label>Subscription IDs (comma-separated)</Form.Label>
          <Form.Control
            type="text"
            value={subscriptions}
            onChange={(e) => setSubscriptions(e.target.value)}
            placeholder="Enter subscription IDs"
            required
          />
        </Form.Group>
        <Button type="submit" disabled={loading}>
          {loading ? <Spinner animation="border" size="sm" /> : 'Execute Query'}
        </Button>
      </Form>

      {error && <Alert variant="danger" className="mt-3">{error}</Alert>}

      {results && (
        <div className="mt-4">
          <h3>Query Results</h3>
          <div className="azure-table-container">
            <table className="azure-table">
              <thead>
                <tr>
                  {results.columns && results.columns.map((column, index) => (
                    <th key={index}>{column.name}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {currentItems.map((row, rowIndex) => (
                  <tr key={rowIndex}>
                    {Object.values(row).map((cell, cellIndex) => (
                      <td key={cellIndex}>
                        {typeof cell === 'object' ? JSON.stringify(cell) : String(cell)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="pagination-controls">
            <Form.Group className="items-per-page">
              <Form.Label>Items per page:</Form.Label>
              <Form.Control as="select" value={itemsPerPage} onChange={handleItemsPerPageChange}>
                <option value="10">10</option>
                <option value="25">25</option>
                <option value="50">50</option>
                <option value="100">100</option>
              </Form.Control>
            </Form.Group>
            {renderPagination()}
          </div>
        </div>
      )}
    </div>
  );
};

export default ARGQueryComponent;