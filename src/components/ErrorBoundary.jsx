import React from 'react'

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, errorInfo) {
    console.error('ErrorBoundary caught:', error, errorInfo)
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null })
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-base-300 flex items-center justify-center p-4">
          <div className="card w-full max-w-md shadow-2xl bg-base-100 border border-error/30 rounded-2xl">
            <div className="card-body p-6 text-center">
              <div className="text-5xl mb-4">⚠️</div>
              <h2 className="card-title text-xl font-black text-error justify-center mb-2">
                Something went wrong
              </h2>
              <p className="text-sm opacity-70 mb-4">
                An unexpected error occurred. Please try again or contact support.
              </p>
              {this.state.error && (
                <pre className="text-xs bg-base-300 p-3 rounded-xl overflow-auto max-h-24 mb-4 font-mono text-left border border-base-200">
                  {this.state.error.message}
                </pre>
              )}
              <button onClick={this.handleRetry} className="btn btn-primary btn-block rounded-xl font-bold">
                Try Again
              </button>
            </div>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}