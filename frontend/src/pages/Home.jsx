import BenchmarkForm from '../components/BenchmarkForm.jsx'

export default function Home() {
  return (
    <div className="container py-5">
      <div className="row g-5 align-items-start">
        <div className="col-lg-5">
          <h1 className="display-5 fw-bold">How does your injury rate compare to your industry?</h1>
        </div>
        <div className="col-lg-7">
          <BenchmarkForm />
        </div>
      </div>
    </div>
  )
}
