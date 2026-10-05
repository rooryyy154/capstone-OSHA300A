// The table twin every chart carries: the same numbers, readable without hover or color
export default function DataTable({ columns, rows, summary = 'Show the numbers' }) {
  return (
    <details className="table-toggle">
      <summary>{summary}</summary>
      <div className="table-scroll">
        <table className="data-table">
          <thead>
            <tr>
              {columns.map((column) => (
                <th key={column.key} className={column.numeric ? 'num' : undefined} scope="col">
                  {column.heading}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={row.key ?? index}>
                {columns.map((column) => (
                  <td key={column.key} className={column.numeric ? 'num' : undefined}>
                    {column.format ? column.format(row[column.key], row) : row[column.key]}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  )
}
