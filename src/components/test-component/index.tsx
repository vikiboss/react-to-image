import React from "react";

interface TestComponentProps {
	name: string;
	list: string[];
}

export function TestComponent(props: TestComponentProps) {
	return (
		<div>
			<h1 className="text-3xl text-amber-6">{props.name}</h1>
			<ul>
				{props.list.map((item, index) => (
					<li key={item}>
						Item {index + 1}: {item}
					</li>
				))}
			</ul>
		</div>
	);
}
